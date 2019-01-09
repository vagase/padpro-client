const messages = require('./proto/chatbothub/chatbothub_pb');
const services = require('./proto/chatbothub/chatbothub_grpc_pb');
const grpc = require('grpc');
const config = require('config');
const log = require('./log');
const _ = require('lodash');

module.exports.BotAdapter = class BotAdapter {
    constructor() {
        this.clientId = null;
        this.clientType = null;

        this.botActionHandler = {};
    }

    registerBotAction(actionType, handler) {
        this.botActionHandler[actionType] = handler;
    }

    async handleBotAction(actionType, actionBody) {
        const actionHandler = this.botActionHandler[actionType];
        if (!actionHandler) {
            throw `unsupported bot action: ${actionType}}`;
        }

        return await actionHandler(actionBody);
    }

    // whether bot is signed in or not
    isSignedIn() {
        return false;
    }

    /**
     * @param timeout: default 10 minutes
     * @return {Promise<void>}
     */
    async login(loginInfo, timeout=10*60*1000) {

    }

    async logout() {
        // await this.wxbot.logout()
    }
};

/**
 * BotClient is the middle proxy between hub and client.
 * - communicate with hub with grpc long connection
 * - communicate with client with client's sdk
 * @type {module.BotClient}
 */
module.exports.BotClient = class BotClient {
    constructor(botAdapter) {
        this.botAdapter = botAdapter;

        this.running = false;
        this.loginInfo = null;
        this.botId = null;
        this.tunnel = null;

        this.heartBeatTimer = null;
        this.heartBeatInterval = 10 * 1000;
    }

    async _handleLoginRequest(body) {
        log.info('begin login');

        const loginBody = JSON.parse(body);

        this.botId = loginBody.botId;

        if (loginBody.loginInfo.length > 0) {
            this.loginInfo = JSON.parse(loginBody.loginInfo);
        }

        const ret = await this.botAdapter.login(this.loginInfo);
        log.info('login DONE: ' + JSON.stringify(ret));

        return ret;
    }

    async _handleTunnelEvent(event) {
        const eventType = event.getEventtype();
        const body = event.getBody();
        const clientid = event.getClientid();
        const clientType = event.getClienttype();

        if (eventType === 'PONG') {
            //log.info("PONG " + clientType + " " + clientid);
        } else {
            log.info("CMD ", eventType);

            if (!this.botAdapter.isSignedIn()) {
                this._actionReplyWithError(eventType, body, 'bot instance is offline');
                log.error(`[${eventType}] bot instance is offline: ${body}`);
                return;
            }

            try {
                let response = null;
                let unhandled = false;

                if (eventType === 'LOGIN') {
                    response = await this._handleLoginRequest(body);
                } else if (eventType === 'LOGOUT') {
                    response = await this.botAdapter.logout();
                } else if (eventType === 'BOTACTION') {
                    const parsedBody = JSON.parse(body);
                    let actionType = parsedBody.actionType;
                    const actionBody = parsedBody.body;

                    if (actionType === undefined || actionBody === undefined) {
                        log.error("actionBody empty", body);
                        return
                    }

                    response = await this.botAdapter.handleBotAction(actionType, actionBody);
                } else {
                    unhandled = true;
                    log.info(`unhandled message: ${eventType}`);
                }

                if (unhandled) {
                    await this._actionReplyWithError(eventType, body, 'unhandled message');
                }
                else {
                    await this._actionReply(eventType, body, response);
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
            this._sendTunnelEvent("PING");
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

        log.info("begin grpc connection");
        this.running = true;

        // init new grpc connection
        const client = new services.ChatBotHubClient(`${config.get("chatBotHub.host")}:${config.get('chatBotHub.port')}`, grpc.credentials.createInsecure());
        const tunnel = client.eventTunnel();
        this.tunnel = tunnel;

        // init botAdapter
        await this.botAdapter.setup();

        tunnel.on('data', async (eventReply) => {
            return this._handleTunnelEvent(eventReply);
        });

        tunnel.on('error', async (e) => {
            log.error("grpc connection error", "code", e.code, e.details);
            await this.stop();
        });

        tunnel.on('end', async () => {
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
        this.running = false;

        // stop client will not logout client botAdapter
    }
};
