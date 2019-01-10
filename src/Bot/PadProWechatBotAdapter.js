const BotAdapter = require('./BotAdapter');
const log = require('../log');
const fs = require('fs');
const printImage = require("../utils").printImage;
const { Wechaty } = require('wechaty');
const {FileBox} = require('file-box');

module.exports = class PadProWechatBotAdapter extends BotAdapter {
    constructor(token) {
        super();

        this.wechatyInstance = null;
        this.token = token;

        this.contactSelf = null;

        this._setupWechaty();
        this._registerBotActions();
    }

    _setupWechaty() {
        this.wechatyInstance = new Wechaty({
            "puppet": 'wechaty-puppet-padpro',
            "puppetOptions": {
                token: this.token
            }
        });


        this.wechatyInstance
            // emit when the bot needs to show you a QR Code for scanning
            .on('scan', async (qrcode, status) => {
                const QRImageURL = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrcode)}`;

                log.info(`Scan QR Code to login: [${status}] ${QRImageURL}`);

                await printImage(QRImageURL);
            })

            // emit after bot login full successful
            .on('login', (userSelf) => {
                this.contactSelf = userSelf;

                this.invokeCallback('onlogin', [userSelf]);
            })

            // emit after the bot log out
            .on('logout', (userSelf) => {

            })

            // When the bot get error, there will be a Wechaty error event fired.
            .on('error', (error) => {
            })

            // Get bot’s heartbeat.
            .on('heartbeat', (data) => {
            })

            // emit when someone sends bot a friend request
            .on('friendship', (friendship) => {
            })

            // 	emit when there's a new message
            .on('message', (message) => {
            })

            // emit when all data has load completed, in wechaty-puppet-padchat, it means it has sync Contact and Room completed
            .on('ready', () => {

            })

            // emit when anyone join any room
            .on('room-join', (room, inviteeList) => {

            })

            // emit when someone change room topic
            .on('room-topic', (room, newTopic, oldTopic, changer) => {

            })

            // emit when anyone leave the room
            .on('room-leave', (room, leaverList) => {

            })

            // emit when there is a room invitation
            .on('room-invite', (room, inviterList) => {

            });
    }

    async _findTarget(id, actionName) {
        // to room
        if (id.indexOf('@chatroom')) {
            const roomId = id.split('@')[0];
            // TODO:
            const room = await this.wechatyInstance.Room.find({topic: roomId});
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
            const contact = await this.wechatyInstance.Contact.find({alias: id});
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
            await this.wechatyInstance.Friendship.add(contact, content);
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
            await this.wechatyInstance.Friendship.add(contact, content);
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
            await this.wechatyInstance.Room.create(contacts, '');
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
        return this.wechatyInstance.logonoff();
    }

    async login(loginInfo) {
        return this.wechatyInstance.start();
    }

    async logout() {
        return this.wechatyInstance.logout();
    }
}
