const BotAdapter = require('./BotAdapter');
const log = require('../log');
const fs = require('fs');
const { Wechaty } = require('wechaty');
const { PuppetPadpro} = require('wechaty-puppet-padpro');
const {FileBox} = require('file-box');
const config = require('config');
const qrcode = require('qrcode');
const moment = require('moment');
const {parseXml} = require('./utils');
const uuidv4  = require('uuid/v4');

class PadProWechatBotAdapter extends BotAdapter {
    constructor(token) {
        const clientId = config.get('client.clientId');
        const clientType = config.get('client.clientType');
        super(clientId, clientType);

        this.wechatyBot = null;
        this.token = token;

        this.contactSelf = null;

        this._registerBotActions();
        this._setupObjectDecoders();
    }

    async _handleBotMessage(message) {
        const MessageType = this.wechatyBot.Message.Type;

        const preparePayload = async (message, xmlContent=false) => {
            const payload = {};
            payload['fromUser'] = message.from().id;
            payload['fromUserName'] = message.from().name();
            payload['content'] = message.text();

            if (message.room()) {
                payload['groupId'] = await message.room().id;
                payload['groupName'] = await message.room().topic();
            }

            if (xmlContent) {
                let xml = await parseXml(payload['content']);
                if (xml) {
                    payload['content'] = xml;
                }
                else {
                    log.error('message content is not xml format: ', xml);
                }
            }

            return payload;
        };

        const handlersDict = {
            [MessageType.Attachment]: (message) => {
            },

            [MessageType.Audio]: (message) => {
            },

            [MessageType.Contact]: async (message) => {
            },

            [MessageType.Emoticon]: async (message) => {
                /**
                 <msg>
                 <emoji fromusername="vagase" tousername="wxid_4njphaafgcnb12" type="2" idbuffer="media:0_0" md5="aeb0975bbfa236b0d3ceb49f5d0066ec"
                 len="35598" productid="com.tencent.xin.emoticon.person.stiker_1523884497529b0b6c6b473f5e" androidmd5="aeb0975bbfa236b0d3ceb49f5d0066ec"
                 androidlen="35598" s60v3md5="aeb0975bbfa236b0d3ceb49f5d0066ec" s60v3len="35598" s60v5md5="aeb0975bbfa236b0d3ceb49f5d0066ec"
                 s60v5len="35598" cdnurl="http://emoji.qpic.cn/wx_emoji/ydZXa4cljfLicPHsB99gf9QIwAsY2CdZz0CicovRqjmXyXPwcAxQDuRiaibU9vuztm34/"
                 designerid="" thumburl="http://mmbiz.qpic.cn/mmemoticon/ajNVdqHZLLDOlsGtttOfyNbyecMWTWx5ibx8gOI3mxytnZ9MMTTABCdmxJl1T4N0B/0"
                 encrypturl="http://emoji.qpic.cn/wx_emoji/ydZXa4cljfLicPHsB99gf9QIwAsY2CdZz0CicovRqjmXwicg3Mx0h7PR6ozGXfM9lII/"
                 aeskey="886fd4cd528e2a4a39fec7b2a81b71c3" externurl="http://emoji.qpic.cn/wx_emoji/ydZXa4cljfLicPHsB99gf9QIwAsY2CdZz0CicovRqjmXyVupyicOjfxU4FPhb5ic1BKk/"
                 externmd5="f62e4409732dc762bba157069dc7fcb7" width="240" height="240" tpurl="" tpauthkey="" attachedtext=""
                 attachedtextcolor="" lensid=""></emoji>
                 <gameext type="0" content="0"></gameext>
                 </msg>
                 * @type {*}
                 */
                const payload = await preparePayload(message, true);
                this.sendHubEvent(BotAdapter.HubEvent.IMAGEMESSAGE, payload);
            },

            [MessageType.Image]: async (message) => {
                /**
                 <?xml version="1.0"?>
                 <msg>
                 <img aeskey="3820e3f776a09eac131488507aa73a11" encryver="1" cdnthumbaeskey="3820e3f776a09eac131488507aa73a11" cdnthumburl="30500201000449304702010002040efc543e02032f56c30204a8af947502045c9b284d0422373838363134373430344063686174726f6f6d313735355f313535333637323236390204010800020201000400" cdnthumblength="3656" cdnthumbheight="67" cdnthumbwidth="120" cdnmidheight="0" cdnmidwidth="0" cdnhdheight="0" cdnhdwidth="0" cdnmidimgurl="30500201000449304702010002040efc543e02032f56c30204a8af947502045c9b284d0422373838363134373430344063686174726f6f6d313735355f313535333637323236390204010800020201000400" length="12661" md5="768dcc20cf6c47c24ad2f1b9824907e0" />
                 </msg>
                 */

                const payload = await preparePayload(message, true);

                const imageId = this.contactSelf.id + "-" + uuidv4();
                payload.imageId = imageId;

                const fileBox = await message.toFileBox();
                await fileBox.toFile(`cache/${imageId}`);

                this.sendHubEvent(BotAdapter.HubEvent.IMAGEMESSAGE, payload);
            },

            [MessageType.Text]: async (message) => {
                const text = message.text();
                if (/ding/.test(text)) {
                    await message.say('dong. receive: ' + text);
                    return;
                }

                const payload = await preparePayload(message);
                this.sendHubEvent(BotAdapter.HubEvent.MESSAGE, payload);
            },

            [MessageType.Video]: (message) => {
            },

            [MessageType.Url]: async (message) => {
                /**
                 <?xml version="1.0"?>
                 <msg>
                 <appmsg appid="wx7217cc66fbed6d1d" sdkver="0">
                 <title>【5.2折抢】Missha谜尚 谜尚红BB霜 SPF42+ PA+++ 50ml</title>
                 <des>波罗蜜只卖￥87.1元，足足5.2折！还不快来抢！</des>
                 <action />
                 <type>5</type>
                 <showtype>0</showtype>
                 <soundtype>0</soundtype>
                 <mediatagname />
                 <messageext />
                 <messageaction />
                 <content />
                 <contentattr>0</contentattr>
                 <url>https://fx.bolo.me/module/landing/daiyanren.html?rev=https%3A%2F%2Ffx.bolo.me%2F%3Futm_term%3DCC751EB4-BDC8-4682-8E51-D2636FB405F2%26utm_content%3Dsku_144240843157473_144240843180022%26utm_source%3Dwechat_friend%26utm_campaign%3Dapp_share%26utm_medium%3DCC751EB4-BDC8-4682-8E51-D2636FB405F2%26source_type%3Dwechat_friend%26source_id%3DCC751EB4-BDC8-4682-8E51-D2636FB405F2%23%2Fproduct%2F144240843157473%3Fsku%3D144240843180022%26account%3Ddy_142571827670646&amp;user_id=142571827670646</url>
                 <lowurl />
                 <dataurl />
                 <lowdataurl />
                 <appattach>
                 <totallen>0</totallen>
                 <attachid />
                 <emoticonmd5 />
                 <fileext />
                 <cdnthumburl>30570201000450304e02010002030192dd02032f565e020469ebce8c02045c89fe6c042a777875706c6f61645f777869645f346e6a706861616667636e6231323135315f313535323534373433360204010400030201000400</cdnthumburl>
                 <cdnthumbmd5>74321bd4ca6b4fc7a3adf8f84bef9a79</cdnthumbmd5>
                 <cdnthumblength>5064</cdnthumblength>
                 <cdnthumbwidth>201</cdnthumbwidth>
                 <cdnthumbheight>201</cdnthumbheight>
                 <cdnthumbaeskey>f3c135a45d93d1298a45abbd64d385ca</cdnthumbaeskey>
                 <aeskey>f3c135a45d93d1298a45abbd64d385ca</aeskey>
                 <encryver>0</encryver>
                 <filekey>wxid_4njphaafgcnb12151_1552547436</filekey>
                 </appattach>
                 <extinfo />
                 <sourceusername />
                 <sourcedisplayname />
                 <thumburl />
                 <md5 />
                 <statextstr>GhQKEnd4NzIxN2NjNjZmYmVkNmQxZA==</statextstr>
                 </appmsg>
                 <fromusername>vagase</fromusername>
                 <scene>0</scene>
                 <appinfo>
                 <version>2</version>
                 <appname>波罗蜜日韩购</appname>
                 </appinfo>
                 <commenturl></commenturl>
                 </msg>
                 * @type {*}
                 */

                const payload = await preparePayload(message, true);
                this.sendHubEvent(BotAdapter.HubEvent.MESSAGE, payload);
            },

            [MessageType.Unknown]: (message) => {
                log.error('MessageType.Unknow: ' + message.toString());
            },
        };

        const handler = handlersDict[message.type()];
        if (handler) {
            return handler(message);
        }
        else {
            throw 'unhandled message: ' + message.toString();
        }
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
                log.debug(`on scan: ${QRImageURL} ${status}`);

                const qrURLData = await qrcode.toDataURL(url);
                this.sendHubEvent(BotAdapter.HubEvent.LOGIN_SCAN, {url: qrURLData, status: status});
            })

            // emit after bot login full successful
            .on('login', async (userSelf) => {
                log.debug(`on login: ${userSelf}`);

                // 主动同步通讯录
                await userSelf.sync();

                this.contactSelf = userSelf;

                this.sendHubEvent(BotAdapter.HubEvent.LOGIN_DONE, {
                    userName: userSelf.id
                });

                await this._sendTextToFileHelper('已登录');
            })

            // emit when all data has load completed, in wechaty-puppet-padchat, it means it has sync Contact and Room completed
            .on('ready', async () => {
                log.debug(`on ready`);

                // 当联系人和聊天都同步好后，给文件助手发一条消息
                await this._sendTextToFileHelper('已完成同步');
            })

            // emit after the bot log out
            .on('logout', async (userSelf) => {
                log.debug(`on logout: ${userSelf}`);

                this.sendHubEvent(BotAdapter.HubEvent.LOGOUT_DONE, '用户已主动登出');
            })

            // When the bot get error, there will be a Wechaty error event fired.
            .on('error', async (error) => {
                log.debug(`on error: ${error}`);
            })

            // Get bot’s heartbeat.
            .on('heartbeat', (data) => {
            })

            // emit when someone sends bot a friend request
            .on('friendship', (friendship) => {
                log.debug(`on friendship: ${friendship}`);

                const payload = this.decodeObject(friendship, BotAdapter.ObjectType.Friendship, {fullfill: true});
                this.sendHubEvent(BotAdapter.HubEvent.FRIEND_REQUEST, payload);
            })

            // 	emit when there's a new message
            .on('message', async (message) => {
                log.debug(`on message: ${message.toString()}`);

                // 仅推送30秒之前的数据
                if (message.age() >= 30*60) {
                    return;
                }

                await this._handleBotMessage(message);
            })

            // emit when anyone join any room
            .on('room-join', (room, inviteeList) => {
                log.debug(`on room-join: ${room} ${inviteeList}`);
            })

            // emit when someone change room topic
            .on('room-topic', (room, newTopic, oldTopic, changer) => {
                log.debug(`on room-topic: ${room} ${newTopic} ${oldTopic} ${changer}`);
            })

            // emit when anyone leave the room
            .on('room-leave', (room, leaverList) => {
                log.debug(`on room-leave: ${room} ${leaverList}`);
            })

            // emit when there is a room invitation
            .on('room-invite', (room, inviterList) => {
                log.debug(`on room-invite: ${room} ${inviterList}`);
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
        this.registerHubAction("SendTextMessage", async (actionBody) => {
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

        this.registerHubAction("SendAppMessage", async (actionBody) => {
            let toUserName = actionBody.toUserName;
            let object = actionBody.object;
            if (toUserName === undefined || object === undefined) {
                log.error("send app message empty")
                return;
            }

            const target = await this._findTarget(toUserName, 'SendAppMessage');

            // TODO:
        });

        this.registerHubAction("SendImageResourceMessage", async (actionBody) => {
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

        this.registerHubAction("AcceptUser", async (actionBody) => {
            let stranger = actionBody.stranger;
            let ticket = actionBody.ticket;
            if (stranger === undefined || ticket === undefined ) {
                log.error("accept user message empty")
                return;
            }

            // const frendship = Friendship.load()

            // TODO:
        });

        this.registerHubAction("AddContact", async (actionBody) => {
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

        this.registerHubAction("SayHello", async (actionBody) => {
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

        this.registerHubAction("GetContact", async (actionBody) => {
            let userId = actionBody.userId;
            if (userId === undefined) {
                log.error("get contact message empty")
                return
            }

            return this._findTarget(userId, 'GetContact');
        });

        this.registerHubAction("CreateRoom", async (actionBody) => {
            let userList = actionBody.userList;
            log.info("create room userlist %o", userList)
            if (userList === undefined) {
                log.error("create room message empty")
                return
            }

            const contacts = await this._findTargetList(userList, 'CreateRoom');
            await this.wechatyBot.Room.create(contacts, '');
        });

        this.registerHubAction("GetRoomMembers", async (actionBody) => {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room members message empty")
                return
            }

            const room = await this._findTarget(groupId, 'GetRoomMembers');
            return room.memberAll();
        });

        this.registerHubAction("GetRoomQRCode", async (actionBody) => {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room QRCode message empty")
                return
            }

            const room = await this._findTarget(groupId, 'GetRoomQRCode');
            return room.qrcode();
        });

        this.registerHubAction("AddRoomMember", async (actionBody) => {
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

        this.registerHubAction("InviteRoomMember", async (actionBody) => {
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

        this.registerHubAction("DeleteRoomMember", async (actionBody) => {
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

        this.registerHubAction("SetRoomAnnouncement", async (actionBody) => {
            let groupId = actionBody.groupId;
            let content = actionBody.content;
            if (groupId === undefined || userId === undefined ) {
                log.error("set room announcement message empty")
                return
            }

            const room = await this._findTarget(groupId, 'SetRoomAnnouncement');
            await room.announce(content);
        });

        this.registerHubAction("SetRoomName", async (actionBody) => {
            let groupId = actionBody.groupId
            let content = actionBody.content
            if (groupId === undefined || userId === undefined ) {
                log.error("set room name message empty")
                return
            }

            const room = await this._findTarget(groupId, 'SetRoomName');
            await room.topic(content);
        });

        this.registerHubAction("GetContantQRCode", async (actionBody) => {
            let userId = actionBody.userId
            let style = actionBody.style
            if (userId === undefined || style === undefined) {
                log.error("get contact qrcode message empty")
                return
            }

            return this.contactSelf.qrcode();
        });
    }

    _setupObjectDecoders() {
        this.objectDecoders = {
            [BotAdapter.ObjectType.Room]: (room, options) => {
                /**
                 {
                  "id": "12117117522@chatroom",
                  "memberIdList": "[\"vagase\",\"wxid_4njphaafgcnb12\",\"wxid_6531975319512\",\"Joully\"]\n",
                  "ownerId": "vagase",
                  "topic": "kol-explorer"
                }
                 */

                // 因为 memberIdList 会很长，所以除非 fullfill 否则不 populate 这个字段

                const result = Object.assign({}, room.payload);

                if (!options.fullfill) {
                    delete result['memberIdList'];
                }

                return result;
            },

            [BotAdapter.ObjectType.Contact]: (contact) => {
                /**
                    {
                      "alias": "",
                      "avatar": "http://wx.qlogo.cn/mmhead/ver_1/Jd7qTsCApoKIY0j85OXzdMVoDT6bzROw8ibWiaBs47qmeC4lnJs0UB4DG8Sy0ibAE1rSg8vSehbGCIWS8ukQ6SWIQ/0",
                      "city": "",
                      "gender": 1,
                      "id": "vagase",
                      "name": "好大",
                      "province": "",
                      "signature": "良好的判断力源于经验，而经验则往往来自于错误的判断。",
                      "type": 1,
                      "friend": true
                    }
                 */
                return Object.assign({}, contact.payload);
            },

            [BotAdapter.ObjectType.Friendship]: (friendship, options) => {
                /**
                {
                    "domain": null,
                    "_events": {},
                    "_eventsCount": 0,
                    "id": "1729841985215778218",
                    "payload": {
                        "contactId": "vagase",
                        "hello": "你好",
                        "id": "1729841985215778218",
                        "stranger": "v1_4bee831025c1714f8317135ebabfffd188afe4fe6bc78aa5d7b082e8ec801668@stranger",
                        "ticket": "v2_44ad35fc8b57ec0db00e65189a66206033e20d64e53d74511c26f1a98a3682c90627cb45c50463ce7082623cf94f15b4@stranger",
                        "type": 2
                    }
                }
                 */
                const payload = Object.assign({}, friendship.payload);

                if (options.fullfill) {
                    payload.contact = this.decodeObject(friendship.contact(), BotAdapter.ObjectType.Contact);
                }

                return payload;
            },

            [BotAdapter.ObjectType.Message]: (message, options) => {
                /*
                {
                  "id": "2724616628474814304",
                  "timestamp": 1552545170,
                  "type": 7,
                  "fromId": "vagase",
                  "from": {...},
                  "text": "test",
                  "toId": "wxid_4njphaafgcnb12"
                  "to": {...},
                  "roomId": 'xxxx',
                  "room: {...}
                }
                 */

                const messagePayload = Object.assign({}, message.payload);

                if (options.fullfill) {
                    const from = this.decodeObject(message.from(), BotAdapter.ObjectType.Contact);
                    const to = this.decodeObject(message.to(), BotAdapter.ObjectType.Contact);
                    const room = this.decodeObject(message.room(), BotAdapter.ObjectType.Room);

                    messagePayload['from'] = from;
                    messagePayload['to'] = to;
                    messagePayload['room'] = room;
                }

                return messagePayload;
            },

            [BotAdapter.ObjectType.RoomInvitation]: (roomInvitation) => {

            }
        }
    }

    isSignedIn() {
        return this.wechatyBot && this.wechatyBot.logonoff();
    }

    async login(loginInfo) {
        // 重复登录，直接返回
        if (this.wechatyBot) {
            this.sendHubEvent(BotAdapter.HubEvent.LOGIN_DONE, {
                userName: this.contactSelf.id
            });

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
}

module.exports = PadProWechatBotAdapter;
