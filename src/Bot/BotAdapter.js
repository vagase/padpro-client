const log = require('../log');

class BotAdapter {
    constructor(clientId, clientType) {
        this.clientId = clientId;
        this.clientType = clientType;

        this.hubActionHandler = {};

        this.botCallbacks = {};

        this.objectDecoders = {};
    }

    registerHubAction(actionType, handler) {
        this.hubActionHandler[actionType] = handler;
    }

    async handleHubAction(actionType, actionBody) {
        const actionHandler = this.hubActionHandler[actionType];
        if (!actionHandler) {
            throw `unsupported bot action: ${actionType}}`;
        }

        return await actionHandler(JSON.parse(actionBody));
    }

    registerBotCallback(name, func) {
        this.botCallbacks[name] = func;
    }

    async invokeBotCallback(name, payload) {
        const func = this.botCallbacks[name];
        if(func) {
            return func(payload)
        }
    }

    sendHubEvent(eventType, eventBody = {}) {
        return this.invokeBotCallback(BotAdapter.Callback.SEND_HUB_EVENT, {
            eventType,
            eventBody
        });
    }

    // whether bot is signed in or not
    isSignedIn() {
        return false;
    }

    /**
     * @param timeout: default 10 minutes
     * @return {Promise<void>}
     */
    async login(loginInfo) {
    }

    async logout() {
    }

    // 只有在登录情况下，register 之后就里面发送一个 logindone
    async tryToSendLoginInfoToHub() {
    }

    /**
     * 将各个 adapter 的队形 decode 为标准 json 数据格式
     * @param obj
     * @param objectType
     * @param options
     * - fullfill: 是否将相关 object 都填充，比如 message 的 from, to, room
     * @return {*}
     */
    async decodeObject(obj, objectType, options = {}) {
        if (!obj) {
            return null;
        }

        const decoder = this.objectDecoders[objectType];
        return decoder(obj, options);
    }
}

BotAdapter.Callback = {
    SEND_HUB_EVENT: 'sendHubEvent',
};

BotAdapter.HubEvent = {
    LOGIN_DONE: 'LOGINDONE',
    LOGOUT_DONE: 'LOGOUTDONE',
    LOGIN_SCAN: 'LOGINSCAN',
    FRIEND_REQUEST: 'FRIENDREQUEST',
    MESSAGE: 'MESSAGE',
    IMAGEMESSAGE: 'IMAGEMESSAGE',
    EMOJIMESSAGE: 'EMOJIMESSAGE',
    CONTACTLIST: 'CONTACTLIST',
    GROUPLIST: 'GROUPLIST'
};

BotAdapter.ObjectType = {
    Room: 'Room',
    Contact: 'Contact',
    Friendship: 'Friendship',
    Message: 'Message',
    RoomInvitation: 'RoomInvitation'
};

module.exports = BotAdapter;
