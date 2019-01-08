const messages = require('./proto/chatbothub/chatbothub_pb');
const services = require('./proto/chatbothub/chatbothub_grpc_pb');
const grpc = require('grpc');
const config = require('config');
const log = require('./log');
const _ = require('lodash');

class BotClientAdapter {
    constructor() {
        this.clientId = null;
        this.clientType = null;

        this.botActionHandler = {};
    }

    registerBotAction(actionType, handler) {
        this.botActionHandler[actionType] = handler;
    }

    // whether
    isOnline() {
        // return !!this.wxbot
    }

    async setup() {

    }

    async login() {

    }

    async logout() {
        // await this.wxbot.logout()
    }

    async handleBotAction(actionType, actionBody) {
        const actionHandler = this.botActionHandler[actionType];
        if (!actionHandler) {
            throw `unsupported bot action: ${actionType}}`;
        }

        return await actionHandler(actionType, actionBody);
    }
}

/**
 * BotClient is the middle proxy between hub and client.
 * - communicate with hub with grpc long connection
 * - communicate with client with client's sdk
 * @type {module.BotClient}
 */
module.exports = class BotClient {
    constructor(adapter) {
        this.adapter = adapter;

        this.running = false;
        this.loginInfo = null;
        this.botId = null;
        this.tunnel = null;

        this.heartBeatTimer = null;
        this.heartBeatInterval = 10 * 1000;
    }

    _handleBotAction(actionType, actionBody) {
        let ret = null;

        if(actionType !== "SendImageMessage") {
            log.info("actionBody %o", actionBody)
        } else {
            log.info("actionType %s", actionType)
        }

        if (actionType === "SendTextMessage") {
            let toUserName = actionBody.toUserName;
            let content = actionBody.content;
            let atList = actionBody.atList;
            if (toUserName === undefined || content === undefined || atList === undefined) {
                log.error("send text message empty")
                return
            }

            // ret = await bot.wxbot.sendMsg(toUserName, content, atList)
        } else if (actionType === "SendAppMessage") {
            let toUserName = actionBody.toUserName;
            let object = actionBody.object;
            if (toUserName === undefined || object === undefined) {
                log.error("send app message empty")
                return
            }
            // ret = await bot.wxbot.sendAppMsg(toUserName, object)
        } else if (actionType === "SendImageResourceMessage") {
            let toUserName = actionBody.toUserName;
            let imageId = actionBody.imageId;
            if (toUserName === undefined || imageId === undefined) {
                log.error("send image message empty")
                return
            }

            let rawFile = String(fs.readFileSync(`cache/${imageId}`))
            // ret = await bot.wxbot.sendImage(toUserName, rawFile)
            // log.info("send file %d returned %o", rawFile.length, ret)
            // log.info(rawFile.substr(0, 80))
        } else if (actionType === "AcceptUser") {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            if (stranger === undefined || ticket === undefined ) {
                log.error("accept user message empty")
                return
            }
            // ret = await bot.wxbot.acceptUser(stranger, ticket)
        } else if (actionType === "AddContact") {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            let type = actionBody.type;
            let content = actionBody.content;
            if (stranger === undefined || ticket === undefined || type === undefined) {
                log.error("add contact message empty")
                return
            }

            // if (content === undefined) {
            //     ret = await bot.wxbot.addContact(stranger, ticket, type)
            // } else {
            //     ret = await bot.wxbot.addContact(stranger, ticket, type, content)
            // }
        } else if (actionType === "SayHello") {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            let content = actionBody.content;
            if (stranger === undefined || ticket === undefined || content === undefined) {
                log.error("say hello message empty")
                return
            }
            // ret = await bot.wxbot.SayHello(stranger, ticket, content)
        } else if (actionType == "GetContact") {
            let userId = actionBody.userId;
            if (userId === undefined) {
                log.error("get contact message empty")
                return
            }
            // ret = await bot.wxbot.getContact(userId)
        } else if (actionType == "CreateRoom") {
            let userList = actionBody.userList;
            log.info("create room userlist %o", userList)
            if (userList === undefined) {
                log.error("create room message empty")
                return
            }
            // ret = await bot.wxbot.createRoom(userList)
        } else if (actionType == "GetRoomMembers") {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room members message empty")
                return
            }
            // ret = await bot.wxbot.getRoomMembers(groupId)
        } else if (actionType == "GetRoomQRCode") {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room QRCode message empty")
                return
            }
            // ret = await bot.wxbot.getRoomQrcode(groupId)
        } else if (actionType == "AddRoomMember") {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("add room member message empty")
                return
            }
            // ret = await bot.wxbot.addRoomMember(groupId, userId)
        } else if (actionType == "InviteRoomMember") {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("invite room member message empty")
                return
            }
            // ret = await bot.wxbot.inviteRoomMember(groupId, userId)
        } else if (actionType == "DeleteRoomMember") {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("delete room member message empty")
                return
            }
            // ret = await bot.wxbot.deleteRoomMember(groupId, userId)
        } else if (actionType == "SetRoomAnnouncement") {
            let groupId = actionBody.groupId;
            let content = actionBody.content;
            if (groupId === undefined || userId === undefined ) {
                log.error("set room announcement message empty")
                return
            }
            // ret = await bot.wxbot.setRoomAnnouncement(groupId, content)
        } else if (actionType == "SetRoomName") {
            let groupId = actionBody.groupId
            let content = actionBody.content
            if (groupId === undefined || userId === undefined ) {
                log.error("set room name message empty")
                return
            }
            // ret = await bot.wxbot.setRoomName(groupId, content)
        } else if (actionType == "GetContantQRCode") {
            let userId = actionBody.userId
            let style = actionBody.style
            if (userId === undefined || style === undefined) {
                log.error("get contact qrcode message empty")
                return
            }
            // ret = await bot.wxbot.getContactQrcode(userId, style)
        } else {
            log.error("unsupported action", actionType)
        }

        return ret;
    }

    async _handleLoginRequest(body) {
        log.info('begin login');

        const loginBody = JSON.parse(body);

        this.botId = loginBody.botId;

        if (loginBody.loginInfo.length > 0) {
            this.loginInfo = JSON.parse(loginBody.loginInfo);
        }

        const ret = await this.adapter.login(this.loginInfo);
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

            if (!this.adapter.isOnline()) {
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
                    response = await this.adapter.logout();
                } else if (eventType === 'BOTACTION') {
                    const parsedBody = JSON.parse(body);
                    let actionType = parsedBody.actionType;
                    const actionBody = parsedBody.body;

                    if (actionType === undefined || actionBody === undefined) {
                        log.error("actionBody empty", body);
                        return
                    }

                    response = await this.adapter.handleBotAction(actionType, actionBody);
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

            req.setClientid(this.adapter.clientId);
            req.setClienttype(this.adapter.clientType);

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

    _startHeartBeatTimer() {
        if (this.heartBeatTimer) {
            return;
        }

        this.heartBeatTimer = setInterval(async () => {
            this._sendTunnelEvent("PING");
        }, this.heartBeatInterval);
    }

    _stopHeartBeatTimer() {
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

        // init adapter
        await this.adapter.setup();

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

        this._startHeartBeatTimer();
    }

    async stop() {
        if (!this.running) {
            return;
        }

        this._stopHeartBeatTimer();

        this.tunnel.end();
        this.running = false;

        // stop client will not logout client adapter
    }
};
