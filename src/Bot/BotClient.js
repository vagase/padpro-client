const messages = require('../proto/chatbothub/chatbothub_pb');
const services = require('../proto/chatbothub/chatbothub_grpc_pb');
const grpc = require('grpc');
const config = require('config');
const log = require('../log');
const _ = require('lodash');

/**
 * BotClient is the middle proxy between hub and client.
 * - communicate with hub with grpc long connection
 * - communicate with client with client's sdk
 * @type {module.BotClient}
 */
module.exports = class BotClient {
    constructor(botAdapter) {
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
        this.botAdapter.registerCallback('onlogin', async (userSelf) => {
            await this._actionReply("LOGINDONE", {
                userName: userSelf.id,
                wxData: this.loginInfo.wxData,
                token: this.loginInfo.token,
                botId: this.botId,
            });
        });
    }

    async _handleLoginRequest(body) {
        if (this.botAdapter.isSignedIn()) {
            log.error("cannot login again while current bot is running.")

            await this._actionReplyWithError('LOGINFAILED', "cannot login again while current bot is running.");
            return;
        }

        log.info('begin login');

        const loginBody = JSON.parse(body);

        this.botId = loginBody.botId;

        if (loginBody.loginInfo.length > 0) {
            this.loginInfo = JSON.parse(loginBody.loginInfo);
        }

        await this.botAdapter.login(this.loginInfo);
    }

    async _handleTunnelEvent(event) {
        const eventType = event.getEventtype();
        const body = event.getBody();
        const clientid = event.getClientid();
        const clientType = event.getClienttype();

        if (eventType === 'PONG') {
            //log.info("PONG " + clientType + " " + clientid);
            return;
        }

        log.info(`received tunnel event: ${eventType}`);

        if (eventType === 'LOGIN') {
            await this._handleLoginRequest(body);
        }
        else if (eventType === 'LOGOUT') {
            if (!this.botAdapter.isSignedIn()) {
                await this._actionReplyWithError(eventType, body, 'Can not logout, because the bot is not signed on');
                log.error(`Can not logout, because the bot is not signed on`);
                return;
            }

            await this.botAdapter.logout();
        }
        else {
            if (!this.botAdapter.isSignedIn()) {
                await this._actionReplyWithError(eventType, body, 'Bot is not signed on, can not execute any action.');
                log.error(`[${eventType}] Bot is not signed on, can not execute any action: ${body}`);
                return;
            }

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

                    response = await this.botAdapter.handleBotAction(actionType, actionBody);
                }

                if (handled) {
                    await this._actionReply(eventType, body, response);
                }
                else {
                    await this._actionReplyWithError(eventType, body, 'unhandled message');

                    log.info(`[${eventType}] unhandled message`);
                }
            }
            catch (e) {
                await this._actionReplyWithError(eventType, body, e.toString());
            }
        }
    }

    _sendTunnelEvent(eventType, eventBody) {
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

        log.info(`tunnel send: [${eventType}] ${bodyStr}`);

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

    _actionReply(eventType, body, result) {
        return this._sendTunnelEvent(
            'ACTIONREPLY',
            {
                eventType: eventType,
                body: body,
                result: result
            });
    }

    _actionReplyWithError(eventType, body, error) {
        return this._actionReply(eventType, body, {
            error
        });
    }

    _startHubHeartBeat() {
        if (this.heartBeatTimer) {
            return;
        }

        this.heartBeatTimer = setInterval(async () => {
            this._sendTunnelEvent("PING", "");
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
            return this._handleTunnelEvent(eventReply);
        });

        this.tunnel.on('error', async (e) => {
            log.error("grpc connection error", "code", e.code, e.details);
            await this.stop();
        });

        this.tunnel.on('end', async () => {
            log.info("grpc connection closed");
            await this.stop();
        });

        // Register client with hub instantly.
        await this._sendTunnelEvent("REGISTER", "HELLO");

        this._startHubHeartBeat();
    }

    async stop() {
        if (!this.running) {
            return;
        }

        this._stopHubHeartBeat();

        this.tunnel.end();
        this.tunnel = null;
        this.running = false;

        // stop client will not logout client botAdapter
    }
};
