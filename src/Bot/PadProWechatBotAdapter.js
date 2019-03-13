const {BotAdapter, BotAdapterCallback} = require('./BotAdapter');
const log = require('../log');
const fs = require('fs');
const { Wechaty } = require('wechaty');
const { PuppetPadpro} = require('wechaty-puppet-padpro');
const {FileBox} = require('file-box');
const config = require('config');
const qrcode = require('qrcode');
const moment = require('moment');

module.exports = class PadProWechatBotAdapter extends BotAdapter {
    constructor(token) {
        const clientId = config.get('client.clientId');
        const clientType = config.get('client.clientType');
        super(clientId, clientType);

        this.wechatyBot = null;
        this.token = token;

        this.contactSelf = null;

        this._registerBotActions();
    }

    _newWechatyBot() {
        // const puppet = new PuppetPadpro({
        //     token: this.token,
        // });
        //
        // const result = new Wechaty({
        //     puppet
        // });

        const result = new Wechaty({
            puppet: 'wechaty-puppet-padchat',
            puppetOptions: {
                token: 'puppet_padchat_a8f8e6a2b9463ee8',
            },
        });

        /**
         * 1. 关于 on.login、on.logout、on.error
         *  机器人登录了(on.login)，因为一些问题（比如网络）可能调用 on.logout 或 on.error。
         *  之后机器人会继续尝试登录，当登录成功后会继续调用 on.login
         */

        result
        // emit when the bot needs to show you a QR Code for scanning
            .on('scan', async (url, status) => {
                const QRImageURL = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}`;
                console.debug(`on scan: ${QRImageURL} ${status}`);

                const qrURLData = await qrcode.toDataURL(url);
                this.invokeBotCallback(BotAdapterCallback.ON_QRCODE, {url: qrURLData, status: status});
            })

            // emit after bot login full successful
            .on('login', async (userSelf) => {
                console.debug(`on login: ${userSelf}`);

                // 主动同步通讯录
                await userSelf.sync();

                this.contactSelf = userSelf;

                this.invokeBotCallback(BotAdapterCallback.ON_LOGIN, userSelf);

                await this._sendTextToFileHelper('已登录');
            })

            // emit after the bot log out
            .on('logout', async (userSelf) => {
                console.debug(`on logout: ${userSelf}`);

                this.invokeBotCallback(BotAdapterCallback.ON_LOGOUT, '用户已主动登出');
            })

            // When the bot get error, there will be a Wechaty error event fired.
            // TODO: 如果异常下线，尝试重连、自动登录等操作
            .on('error', async (error) => {
                console.debug(`on error: ${error}`);

                this.invokeBotCallback(BotAdapterCallback.ON_LOGOUT, `用户被下线：${error}`);
            })

            // Get bot’s heartbeat.
            .on('heartbeat', (data) => {
            })

            // emit when someone sends bot a friend request
            .on('friendship', (friendship) => {
                console.debug(`on friendship: ${friendship}`);
            })

            // 	emit when there's a new message
            .on('message', (message) => {
                console.debug(`on message: ${message}`);
            })

            // emit when all data has load completed, in wechaty-puppet-padchat, it means it has sync Contact and Room completed
            .on('ready', async () => {
                console.debug(`on ready`);

                // 当联系人和聊天都同步好后，给文件助手发一条消息
                await this._sendTextToFileHelper('已完成同步');
            })

            // emit when anyone join any room
            .on('room-join', (room, inviteeList) => {
                console.debug(`on room-join: ${room} ${inviteeList}`);
            })

            // emit when someone change room topic
            .on('room-topic', (room, newTopic, oldTopic, changer) => {
                console.debug(`on room-topic: ${room} ${newTopic} ${oldTopic} ${changer}`);
            })

            // emit when anyone leave the room
            .on('room-leave', (room, leaverList) => {
                console.debug(`on room-leave: ${room} ${leaverList}`);
            })

            // emit when there is a room invitation
            .on('room-invite', (room, inviterList) => {
                console.debug(`on room-invite: ${room} ${inviterList}`);
            });

        return result;
    }

    async _sendTextToFileHelper(text) {
        const contact = await this._findContact('文件传输助手');
        const time = moment().format('YYYY-MM-DD HH:mm:ss');
        return contact.say(`${time}\n${text}`);
    }

    async _findContact(name, alias) {
        const query = {};
        if (name) {
            query['name'] = name;
        }
        if (alias) {
            query['alias'] = alias;
        }

        const contact = await this.wechatyBot.Contact.find(query);
        if (!contact) {
            throw `contact is not found: ${JSON.stringify(query)}`;
        }

        return contact;
    }

    async _findRoom(topic) {
        const query = {};
        if (topic) {
            query['topic'] = topic;
        }

        const room = await this.wechatyBot.Room.find({topic: topic});
        if (!room) {
            throw  `room is not found: ${JSON.stringify(query)}`;
        }

        return room;
    }

    async _findTarget(id,  actionName) {
        // to room
        if (id.indexOf('@chatroom') !== -1) {
            const roomId = id.split('@')[0];
            // TODO:
            const room = await this.wechatyBot.Room.find({topic: roomId});
            if (!room) {
                let error = actionName ? `${actionName} failed, ` : '';
                error += `room is not found: ${id}`;
                throw error;
            }

            return room;
        }
        // to contact
        else {
            // TODO
            const contact = await this.wechatyBot.Contact.find({name: id});
            if (!contact) {
                let error = actionName ? `${actionName} failed, ` : '';
                error += `contact is not found: ${id}`;
                throw error;
            }

            return contact;
        }
    }

    async _findTargetList(idList, actionName) {
        // concurrent find
        return await Promise.all(idList.map(id => {
            return this._findTarget(id, actionName);
        }));
    }

    _registerBotActions() {

        /**
         * @toUserName:
         * - to user: wx1234124
         * - to room: 123424@chatroom
         */
        this.registerBotAction("SendTextMessage", async (actionBody) => {
            let toUserName = actionBody.toUserName;
            let content = actionBody.content;
            let atList = actionBody.atList;
            if (toUserName === undefined || content === undefined || atList === undefined) {
                log.error("send text message empty")
                return;
            }

            const target = await this._findTarget(toUserName, 'SendTextMessage');

            // TODO: test, and other format message
            await target.say(content)
        });

        this.registerBotAction("SendAppMessage", async (actionBody) => {
            let toUserName = actionBody.toUserName;
            let object = actionBody.object;
            if (toUserName === undefined || object === undefined) {
                log.error("send app message empty")
                return;
            }

            const target = await this._findTarget(toUserName, 'SendAppMessage');

            // TODO:
        });

        this.registerBotAction("SendImageResourceMessage", async (actionBody) => {
            let toUserName = actionBody.toUserName;
            let imageId = actionBody.imageId;
            if (toUserName === undefined || imageId === undefined) {
                log.error("send image message empty")
                return
            }


            let buffer = fs.readFileSync(`cache/${imageId}`);
            const file = FileBox.fromBuffer(buffer, 'image');

            const target = await this._findTarget(toUserName, 'SendImageResourceMessage');
            await target.say(file);
        });

        this.registerBotAction("AcceptUser", async (actionBody) => {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            if (stranger === undefined || ticket === undefined ) {
                log.error("accept user message empty")
                return;
            }

            // const frendship = Friendship.load()

            // TODO:
        });

        this.registerBotAction("AddContact", async (actionBody) => {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            let type = actionBody.type;
            let content = actionBody.content;
            if (stranger === undefined || ticket === undefined || type === undefined) {
                log.error("add contact message empty")
                return
            }

            const contact = await this._findTarget(stranger, 'AddContact');
            await this.wechatyBot.Friendship.add(contact, content);
        });

        this.registerBotAction("SayHello", async (actionBody) => {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            let content = actionBody.content;
            if (stranger === undefined || ticket === undefined || content === undefined) {
                log.error("say hello message empty")
                return;
            }

            const contact = await this._findTarget(stranger, 'AddContact');
            await this.wechatyBot.Friendship.add(contact, content);
        });

        this.registerBotAction("GetContact", async (actionBody) => {
            let userId = actionBody.userId;
            if (userId === undefined) {
                log.error("get contact message empty")
                return
            }

            return this._findTarget(userId, 'GetContact');
        });

        this.registerBotAction("CreateRoom", async (actionBody) => {
            let userList = actionBody.userList;
            log.info("create room userlist %o", userList)
            if (userList === undefined) {
                log.error("create room message empty")
                return
            }

            const contacts = await this._findTargetList(userList, 'CreateRoom');
            await this.wechatyBot.Room.create(contacts, '');
        });

        this.registerBotAction("GetRoomMembers", async (actionBody) => {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room members message empty")
                return
            }

            const room = await this._findTarget(groupId, 'GetRoomMembers');
            return room.memberAll();
        });

        this.registerBotAction("GetRoomQRCode", async (actionBody) => {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room QRCode message empty")
                return
            }

            const room = await this._findTarget(groupId, 'GetRoomQRCode');
            return room.qrcode();
        });

        this.registerBotAction("AddRoomMember", async (actionBody) => {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("add room member message empty")
                return;
            }

            const contact = await this._findTarget(userId, 'AddRoomMember');
            const room = await this._findTarget(groupId, 'AddRoomMember');
            await room.add(contact);
        });

        this.registerBotAction("InviteRoomMember", async (actionBody) => {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("invite room member message empty")
                return
            }

            const contact = await this._findTarget(userId, 'InviteRoomMember');
            const room = await this._findTarget(groupId, 'InviteRoomMember');
            await room.add(contact);
        });

        this.registerBotAction("DeleteRoomMember", async (actionBody) => {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("delete room member message empty")
                return
            }

            const contact = await this._findTarget(userId, 'DeleteRoomMember');
            const room = await this._findTarget(groupId, 'DeleteRoomMember');
            await room.del(contact);
        });

        this.registerBotAction("SetRoomAnnouncement", async (actionBody) => {
            let groupId = actionBody.groupId;
            let content = actionBody.content;
            if (groupId === undefined || userId === undefined ) {
                log.error("set room announcement message empty")
                return
            }

            const room = await this._findTarget(groupId, 'SetRoomAnnouncement');
            await room.announce(content);
        });

        this.registerBotAction("SetRoomName", async (actionBody) => {
            let groupId = actionBody.groupId
            let content = actionBody.content
            if (groupId === undefined || userId === undefined ) {
                log.error("set room name message empty")
                return
            }

            const room = await this._findTarget(groupId, 'SetRoomName');
            await room.topic(content);
        });

        this.registerBotAction("GetContantQRCode", async (actionBody) => {
            let userId = actionBody.userId
            let style = actionBody.style
            if (userId === undefined || style === undefined) {
                log.error("get contact qrcode message empty")
                return
            }

            return this.contactSelf.qrcode();
        });
    }

    isSignedIn() {
        return this.wechatyBot && this.wechatyBot.logonoff();
    }

    async login(loginInfo) {
        if (this.wechatyBot) {
            console.error(`Can not login twice ${this.clientType} ${this.clientId}`);
            return;
        }

        this.wechatyBot = this._newWechatyBot();
        return this.wechatyBot.start();
    }

    async logout() {
        if (!this.wechatyBot) {
            return null;
        }

        await this.wechatyBot.logout();
        this.wechatyBot = null;
    }
};
