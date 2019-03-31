const messages = require('../proto/chatbothub/chatbothub_pb');
const services = require('../proto/chatbothub/chatbothub_grpc_pb');
const grpc = require('grpc');
const config = require('config');
const log = require('../log');
const _ = require('lodash');
const BotAdapter = require('./BotAdapter');
const EventEmitter = require('events');

const mutePingPongLog = true;

/**
 * BotClient is the middle proxy between hub and client.
 * - communicate with hub with grpc long connection
 * - communicate with client with client's sdk
 * @type {module.BotClient}
 */
class BotClient extends EventEmitter {
    constructor(botAdapter) {
        super();

        this.botAdapter = botAdapter;
        this._setupBotAdapter();

        this.running = false;
        this.loginInfo = null;
        this.botId = null;
        this.tunnel = null;

        this.heartBeatTimer = null;
        this.heartBeatInterval = 10 * 1000;
    }

    _setupBotAdapter() {
        const adapter = this.botAdapter;

        adapter.registerBotCallback(BotAdapter.Callback.SEND_HUB_EVENT, async ({eventType, eventBody }) => {
            if (eventType === 'LOGINDONE') {
                eventBody['botId'] = this.botId;
            }

            return this._sendEventToHub(eventType, eventBody);
        });
    }

    _stop(notify = false) {
        if (!this.running) {
            return;
        }

        this._stopHubHeartBeat();

        this.tunnel.end();
        this.tunnel = null;
        this.running = false;

        if (notify) {
            this.emit('stop')
        }

        // stop client will not logout client botAdapter
    }

    // 允许重复登录，重复登录直接返回 login done
    async _handleLoginRequest(body) {
        log.info('begin login');

        const loginBody = JSON.parse(body);

        this.botId = loginBody.botId;

        if (loginBody.loginInfo.length > 0) {
            try {
                this.loginInfo = JSON.parse(loginBody.loginInfo);
            }
            catch (e) {
                console.error('login info is not json format: ');
                console.error(e);
            }
        }

        await this.botAdapter.login(this.loginInfo);
    }

    async _handleEventFromHub(event) {
        const eventType = event.getEventtype();
        const body = event.getBody();
        const clientId = event.getClientid();
        const clientType = event.getClienttype();

        if (eventType === 'PONG') {
            !mutePingPongLog && log.debug("PONG " + clientType + " " + clientId);
            return;
        }

        log.info(`received tunnel event: ${eventType}`);

        if (eventType === 'LOGIN') {
            await this._handleLoginRequest(body);
        }
        else if (eventType === 'LOGOUT') {
            if (!this.botAdapter.isSignedIn()) {
                await this._replyActionToHub(eventType, body, null, 'Can not logout, because the bot is not signed on');
                log.error(`Can not logout, because the bot is not signed on`);
                return;
            }

            await this.botAdapter.logout();
        }
        else {
            if (!this.botAdapter.isSignedIn()) {
                await this._replyActionToHub(eventType, body, null, 'Bot is not signed on, can not execute any action.');
                log.error(`[${eventType}] Bot is not signed on, can not execute any action: ${body}`);
                return;
            }

            log.debug(`> handle event from hub: ${eventType} ${body}`);

            try {
                let response = null;
                let handled = false;

                if (eventType === 'BOTACTION') {
                    handled = true;

                    const parsedBody = JSON.parse(body);
                    let actionType = parsedBody.actionType;
                    const actionBody = parsedBody.body;

                    if (actionType === undefined || actionBody === undefined) {
                        log.error("actionBody empty", body);
                        return
                    }

                    response = await this.botAdapter.handleHubAction(actionType, actionBody);
                }

                if (handled) {
                    log.debug(`> response action to hub success: ${eventType} ${JSON.stringify(response)}`);

                    await this._replyActionToHub(eventType, body, response);
                }
                else {
                    log.error(`> response action to hub fail: ${eventType} unhandled message`);

                    await this._replyActionToHub(eventType, body, 'unhandled message');
                }
            }
            catch (e) {
                log.error(`> response action to hub fail: ${eventType} ${e.toString()}`);

                await this._replyActionToHub(eventType, body, e.toString());
            }
        }
    }

    _sendEventToHub(eventType, eventBody) {
        if (this.tunnel === undefined) {
            log.error('grpc connection not established while receiving wxlogin callback, exit.')
            return
        }

        if (_.isEmpty(eventType)) {
            log.error('wxcallback data.eventType undefined');
            return
        }

        let bodyStr = '';
        if (eventBody) {
            bodyStr = eventBody;
            if (typeof eventBody !== 'string') {
                bodyStr = JSON.stringify(eventBody);
            }

            if (bodyStr.length > 120) {
                bodyStr = bodyStr.substr(0, 120);
            }
        }

        if (eventType === 'PING') {
            !mutePingPongLog && log.debug(`tunnel send: [${eventType}] ${bodyStr}`);
        }
        else {
            log.debug(`tunnel send: [${eventType}] ${bodyStr}`);
        }

        const newEventRequest = (eventType, body) => {
            const req = new messages.EventRequest();
            req.setEventtype(eventType);

            if (body) {
                if (typeof body === 'string') {
                    req.setBody(body);
                }
                else {
                    req.setBody(JSON.stringify(body));
                }
            }

            req.setClientid(this.botAdapter.clientId);
            req.setClienttype(this.botAdapter.clientType);

            return req;
        };

        this.tunnel.write(newEventRequest(eventType, eventBody))
    }

    _replyActionToHub(eventType, originalEventBody, data, error) {
        const result = {};
        if (error) {
            result.success = false;
            result.error = error;
        }
        else {
            result.success = true;
            result.data = data;
        }

        return this._sendEventToHub(
            'ACTIONREPLY',
            {
                eventType: eventType,
                body: originalEventBody,
                result
            });
    }

    _startHubHeartBeat() {
        if (this.heartBeatTimer) {
            return;
        }

        this.heartBeatTimer = setInterval(async () => {
            this._sendEventToHub("PING", "");
        }, this.heartBeatInterval);
    }

    _stopHubHeartBeat() {
        if (!this.heartBeatTimer) {
            return;
        }

        clearInterval(this.heartBeatTimer);
        this.heartBeatTimer = null;
    }

    async start() {
        if (this.running) {
            return;
        }
        this.running = true;

        log.info("begin grpc connection");

        // init new grpc connection
        const client = new services.ChatBotHubClient(`${config.get("chatBotHub.host")}:${config.get('chatBotHub.port')}`, grpc.credentials.createInsecure());
        this.tunnel = client.eventTunnel();

        this.tunnel.on('data', async (eventReply) => {
            return this._handleEventFromHub(eventReply);
        });

        this.tunnel.on('error', async (e) => {
            log.error("grpc connection error", "code", e.code, e.details);
            await this._stop(true);
        });

        this.tunnel.on('end', async () => {
            log.info("grpc connection closed");
            await this._stop(true);
        });

        // Register client with hub instantly.
        await this._sendEventToHub("REGISTER", "HELLO");

        this._startHubHeartBeat();
    }

    async stop() {
        this._stop();
    }
}

module.exports = BotClient;
