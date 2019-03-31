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
const {MemoryCard} = require('memory-card');

class PadProWechatBotAdapter extends BotAdapter {
    constructor(token) {
        const clientId = config.get('client.clientId');
        const clientType = config.get('client.clientType');
        super(clientId, clientType);

        this.wechatyBot = null;
        this.token = token;

        this.contactSelf = null;

        this._registerHubActions();
        this._setupObjectDecoders();
    }

    async _newWechatyBot(loginInfo) {
        // const puppet = new PuppetPadpro({
        //     token: this.token,
        // });
        //
        // const result = new Wechaty({
        //     puppet
        // });

        let memory = null;

        if (loginInfo) {
            const currentUserId = loginInfo.userId;

            memory = new MemoryCard();
            await memory.load();
            const puppetMemory = memory.multiplex('puppet');
            await puppetMemory.set('WECHATY_PUPPET_PADCHAT', {
                currentUserId: currentUserId,
                device: {
                    [currentUserId]: {
                        data: loginInfo.wxData,
                        token: loginInfo.token
                    }
                }
            });
        }


        return new Wechaty({
            puppet: 'wechaty-puppet-padchat',
            puppetOptions: {
                token: 'puppet_padchat_a8f8e6a2b9463ee8',
            },
            memory
        });
    }

    async _sendTextToFileHelper(text) {
        const contact = (await this._findContacts({name: '文件传输助手'}))[0];
        const time = moment().format('YYYY-MM-DD HH:mm:ss');
        return contact.say(`${time}\n${text}`);
    }

    /**
     * @param query
     * {
     *     id: '',
     *     name: '',
     *     alias: ''
     * }
     * @private
     */
    async _findContacts(query = {}) {
        // 因为 wechaty api 限制，不能通过 id 搜索 contact，特此添加通过 id 搜索 contact
        let newQuery = Object.assign({}, query);
        delete newQuery.id;

        if (Object.keys(newQuery).length === 0) {
            newQuery = null;
        }

        let contacts = await this.wechatyBot.Contact.findAll(newQuery);

        if (query.id) {
            contacts =  contacts.filter(contact => {
                if (query.id instanceof RegExp) {
                    return query.id.test(contact.id);
                }
                else if (Array.isArray(query.id)) {
                    return query.id.indexOf(contact.id) !== -1;
                }
                else {
                    return contact.id === query.id;
                }
            });
        }

        return contacts;
    }

    /**
     *
     * @param query
     * {
     *     id: '',
     *     topic: '',
     * }
     * @private
     */
    async _findRooms(query = {}) {
        // 因为 wechaty api 限制，不支持通过 id 搜索 room，特此添加通过 id 搜索 room。

        let newQuery = Object.assign({}, query);
        delete newQuery.id;

        if (Object.keys(newQuery).length === 0) {
            newQuery = null;
        }

        let rooms = await this.wechatyBot.Room.findAll(newQuery);

        if (query.id) {
            rooms = rooms.filter(room => {

                if (query.id instanceof RegExp) {
                    return query.id.test(room.id);
                }
                else if (Array.isArray(query.id)) {
                    return query.id.indexOf(room.id) !== -1;
                }
                else {
                    return room.id === query.id;
                }
            });
        }

        return rooms;
    }

    /**
     * @param id
     * @return {Promise<*>}
     * @private
     */
    async _findTargetsById(id) {
        if (id.indexOf('@chatroom') !== -1) {
            return this._findRooms({ id });
        }
        else {
            return this._findContacts({ id });
        }
    }

    /**
     * @param id
     * @return {Promise<*>}
     * @private
     */
    async _findTargetById(id) {
        const targets = await this._findTargetsById(id);
        return targets && targets[0];
    }

    async _responseLoginDone() {
        const userId = this.contactSelf.id;

        const loginPayload = this.wechatyBot.memory.payload;
        const key = Object.keys(loginPayload)[0];
        const deviceInfo = loginPayload[key]['device'][userId];

        this.sendHubEvent(BotAdapter.HubEvent.LOGIN_DONE, {
            userName: userId,
            token: deviceInfo.token,
            wxData: deviceInfo.data
        });

        // 主动同步通讯录
        await this.contactSelf.sync();
        // 向服务器发送联系人列表
        const allContacts = await this.wechatyBot.Contact.findAll() || [];
        const allContactsPayload = allContacts.map(contact => this.decodeObject(contact, BotAdapter.ObjectType.Contact));
        await this.sendHubEvent(BotAdapter.HubEvent.CONTACTLIST, allContactsPayload);
    }

    _registerBotActions() {
        const _handleBotMessage = async (message) => {
            const MessageType = this.wechatyBot.Message.Type;

            const preparePayload = async (message, xmlContent=false) => {
                const payload = {};
                payload['fromUser'] = message.from().id;
                payload['fromUserName'] = message.from().name();
                payload['content'] = message.text();

                if (message.room()) {
                    payload['groupId'] = await message.room().id;
                    payload['groupName'] = await message.room().topic();

                    const mentions = await message.mention();
                    const mentionsContacts = mentions && mentions.map(m => this.decodeObject(m, BotAdapter.ObjectType.Contact)) || [];
                    if (mentionsContacts.length) {
                        payload['atList'] = mentionsContacts;
                    }
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
                    this.sendHubEvent(BotAdapter.HubEvent.EMOJIMESSAGE, payload);
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

                [MessageType.MiniProgram]: async (message) => {
                    /**
                     文本消息
                     text

                     图片消息
                     <?xml version="1.0"?>
                     <msg>
                     <img aeskey="3820e3f776a09eac131488507aa73a11" encryver="1" cdnthumbaeskey="3820e3f776a09eac131488507aa73a11"
                     cdnthumburl="30500201000449304702010002040efc543e02032f56c30204a8af947502045c9b284d0422373838363134373430344063686174726f6f6d313735355f313535333637323236390204010800020201000400"
                     cdnthumblength="3656" cdnthumbheight="67" cdnthumbwidth="120" cdnmidheight="0" cdnmidwidth="0" cdnhdheight="0"
                     cdnhdwidth="0"
                     cdnmidimgurl="30500201000449304702010002040efc543e02032f56c30204a8af947502045c9b284d0422373838363134373430344063686174726f6f6d313735355f313535333637323236390204010800020201000400"
                     length="12661" md5="768dcc20cf6c47c24ad2f1b9824907e0" />
                     </msg>

                     H5链接卡片
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
                     <url>
                     https://fx.bolo.me/module/landing/daiyanren.html?rev=https%3A%2F%2Ffx.bolo.me%2F%3Futm_term%3DCC751EB4-BDC8-4682-8E51-D2636FB405F2%26utm_content%3Dsku_144240843157473_144240843180022%26utm_source%3Dwechat_friend%26utm_campaign%3Dapp_share%26utm_medium%3DCC751EB4-BDC8-4682-8E51-D2636FB405F2%26source_type%3Dwechat_friend%26source_id%3DCC751EB4-BDC8-4682-8E51-D2636FB405F2%23%2Fproduct%2F144240843157473%3Fsku%3D144240843180022%26account%3Ddy_142571827670646&amp;user_id=142571827670646
                     </url>
                     <lowurl />
                     <dataurl />
                     <lowdataurl />
                     <appattach>
                     <totallen>0</totallen>
                     <attachid />
                     <emoticonmd5 />
                     <fileext />
                     <cdnthumburl>
                     30570201000450304e02010002030192dd02032f565e020469ebce8c02045c89fe6c042a777875706c6f61645f777869645f346e6a706861616667636e6231323135315f313535323534373433360204010400030201000400
                     </cdnthumburl>
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

                     小程序卡片

                     <?xml version="1.0"?>
                     <msg>
                     <appmsg appid="" sdkver="0">
                     <title>快来1.00元起拼【Armani 法国 阿玛尼 小胖丁唇釉 #506 3.9ml】</title>
                     <des />
                     <action />
                     <type>33</type>
                     <showtype>0</showtype>
                     <soundtype>0</soundtype>
                     <mediatagname />
                     <messageext />
                     <messageaction />
                     <content />
                     <contentattr>0</contentattr>
                     <url>https://mp.weixin.qq.com/mp/waerrpage?appid=wx979574d8814e4a12&amp;type=upgrade&amp;upgradetype=3#wechat_redirect</url>
                     <lowurl />
                     <dataurl />
                     <lowdataurl />
                     <appattach>
                     <totallen>0</totallen>
                     <attachid />
                     <emoticonmd5 />
                     <fileext />
                     <cdnthumburl>30570201000450304e02010002030192dd02033d11fd0204a93e5b6502045c9b4557042a777875706c6f61645f777869645f346e6a706861616667636e6231323138375f313535333637393730330204010400030201000400</cdnthumburl>
                     <cdnthumbmd5>b85dfb7b1ed5ee7257c96902358bc708</cdnthumbmd5>
                     <cdnthumblength>22867</cdnthumblength>
                     <cdnthumbwidth>750</cdnthumbwidth>
                     <cdnthumbheight>567</cdnthumbheight>
                     <cdnthumbaeskey>d3317bee189c367ade3d7256f307d2d8</cdnthumbaeskey>
                     <aeskey>d3317bee189c367ade3d7256f307d2d8</aeskey>
                     <encryver>0</encryver>
                     <filekey>wxid_4njphaafgcnb12187_1553679703</filekey>
                     </appattach>
                     <extinfo />
                     <sourceusername>gh_25db1e00370d@app</sourceusername>
                     <sourcedisplayname>正常种草馆</sourcedisplayname>
                     <thumburl />
                     <md5 />
                     <statextstr />
                     <weappinfo>
                     <username><![CDATA[gh_25db1e00370d@app]]></username>
                     <appid><![CDATA[wx979574d8814e4a12]]></appid>
                     <type>2</type>
                     <version>41</version>
                     <weappiconurl><![CDATA[http://mmbiz.qpic.cn/mmbiz_png/5FG1kxO4sI5maibHJlCChJM2ZbibCJ1jhXQ77GNeHP5Iu8vX2v71NicNSxIL8VzbROdyUzErHkt9Tev6icJK6sE31g/640?wx_fmt=png&wxfrom=200]]></weappiconurl>
                     <pagepath><![CDATA[pages/share/index.html?url=bolome%3A%2F%2Fentity%2FGroupPurchaseGroupPageEntity%3Fgroup_id%3D29b1fa37aa895359172428c0f450140f&utm_medium=userid_152752156401456]]></pagepath>
                     <shareId><![CDATA[0_wx979574d8814e4a12_103133_1553679700_0]]></shareId>
                     <appservicetype>0</appservicetype>
                     </weappinfo>
                     </appmsg>
                     <fromusername>vagase</fromusername>
                     <scene>0</scene>
                     <appinfo>
                     <version>1</version>
                     <appname></appname>
                     </appinfo>
                     <commenturl></commenturl>
                     </msg>
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
        };

        /**
         * 1. 关于 on.login、on.logout、on.error
         *  机器人登录了(on.login)，因为一些问题（比如网络）可能调用 on.logout 或 on.error。
         *  之后机器人会继续尝试登录，当登录成功后会继续调用 on.login
         */

        this.wechatyBot
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

                this.contactSelf = userSelf;

                await this._sendTextToFileHelper('已登录');
                await this._responseLoginDone();
                await this._sendTextToFileHelper('已同步完成聊天室、通讯录');
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

                const payload = this.decodeObject(friendship, BotAdapter.ObjectType.Friendship );
                this.sendHubEvent(BotAdapter.HubEvent.FRIEND_REQUEST, payload);
            })

            // 	emit when there's a new message
            .on('message', async (message) => {
                log.debug(`on message: ${message.toString()}`);

                // 仅推送30秒之前的数据
                if (message.age() >= 30*60) {
                    return;
                }

                await _handleBotMessage(message);
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
    }

    _registerHubActions() {
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

            let atContacts = null;
            if (atList && atList.length > 0) {
                atContacts = await this._findContacts({id: atList});
            }

            const target = await this._findTargetById(toUserName);
            await target.say(content, atContacts);
        });

        this.registerHubAction("SendAppMessage", async (actionBody) => {
            let toUserName = actionBody.toUserName;
            let object = actionBody.object;
            if (toUserName === undefined || object === undefined) {
                log.error("send app message empty")
                return;
            }

            const target = await this._findTargetById(toUserName);

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

            const target = await this._findTargetById(toUserName);
            await target.say(file);
        });


        this.registerHubAction("AcceptUser", async (payload) => {
            /**
             * payload:
             * {
                  "contactId": "wxid_b7rvs8pdawnu21",
                  "hello": "我是潘小强",
                  "id": "7652425311615249121",
                  "stranger": "v1_1959335e949eba970bc8d3da307f1e2c4237bc5a4ceb7c40cfddadcbb77f32c50fe8ee3c0a63a302a280845fce9f5bec@stranger",
                  "ticket": "v2_acd0f0a71df04f222ff4d9c8910da209688b5e372dd555f354017dff2be772e547d09b257d99eaa9405c7fa956a663c1218ec705c8632616cde8e137b9cbae88@stranger",
                  "type": 2
                }
             */

            // 通过 payload 重建 friendship 对象
            const friendShip = this.wechatyBot.Friendship.load(payload.id);
            friendShip.payload = payload;

            friendShip.puppet.cacheFriendshipPayload.set(payload.id, payload);

            const type = friendShip.type();
            if (type === this.wechatyBot.Friendship.Type.Receive) {
                await friendShip.accept();
            }
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

            const contact = await this._findTargetById(stranger);
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

            const contact = await this._findTargetById(stranger);
            await this.wechatyBot.Friendship.add(contact, content);
        });

        this.registerHubAction("GetContact", async (actionBody) => {
            let userId = actionBody.userId;
            if (userId === undefined) {
                log.error("get contact message empty")
                return
            }

            return this._findTargetById(userId);
        });

        this.registerHubAction("CreateRoom", async (actionBody) => {
            let userList = actionBody.userList;
            log.info("create room userlist %o", userList)
            if (!userList || userList.length === 0) {
                log.error("create room message empty")
                return
            }

            const contacts = await this._findContacts({id: new RegExp('^('+ userList.join('|') + ')$')});
            const roomCreated = await this.wechatyBot.Room.create(contacts);

            return {
                userName: roomCreated.id,
                status: 0
            };
        });

        this.registerHubAction("GetRoomMembers", async (actionBody) => {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room members message empty")
                return
            }

            const room = await this._findTargetById(groupId);
            return room.memberAll();
        });

        this.registerHubAction("GetRoomQRCode", async (actionBody) => {
            let groupId = actionBody.groupId;
            if (groupId === undefined) {
                log.error("get room QRCode message empty")
                return
            }

            const room = await this._findTargetById(groupId);
            return room.qrcode();
        });

        this.registerHubAction("AddRoomMember", async (actionBody) => {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("add room member message empty")
                return;
            }

            const contact = await this._findTargetById(userId);
            const room = await this._findTargetById(groupId);
            await room.add(contact);
        });

        this.registerHubAction("InviteRoomMember", async (actionBody) => {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("invite room member message empty")
                return
            }

            const contact = await this._findTargetById(userId);
            const room = await this._findTargetById(groupId);
            await room.add(contact);
        });

        this.registerHubAction("DeleteRoomMember", async (actionBody) => {
            let groupId = actionBody.groupId;
            let userId = actionBody.userId;
            if (groupId === undefined || userId === undefined ) {
                log.error("delete room member message empty")
                return
            }

            const contact = await this._findTargetById(userId);
            const room = await this._findTargetById(groupId);
            await room.del(contact);
        });

        this.registerHubAction("SetRoomAnnouncement", async (actionBody) => {
            let groupId = actionBody.groupId;
            let content = actionBody.content;
            if (groupId === undefined || userId === undefined ) {
                log.error("set room announcement message empty")
                return
            }

            const room = await this._findTargetById(groupId);
            await room.announce(content);
        });

        this.registerHubAction("SetRoomName", async (actionBody) => {
            let groupId = actionBody.groupId;
            let content = actionBody.content;
            if (groupId === undefined || content === undefined ) {
                log.error("set room name message empty")
                return
            }

            const room = await this._findTargetById(groupId);
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

    /**
     * @param loginInfo
     * {
     *      userId: '',
     *      token: '',
     *      wxData: ''
     * }
     * @return {Promise<*>}
     */
    async login(loginInfo) {
        // 重复登录，直接返回
        if (this.wechatyBot) {
            await this._responseLoginDone();
            return;
        }

        this.wechatyBot = await this._newWechatyBot(loginInfo);

        this._registerBotActions();

        return this.wechatyBot.start();
    }

    async logout() {
        if (!this.wechatyBot) {
            return null;
        }

        await this.wechatyBot.logout();
        this.wechatyBot = null;
    }

    async tryToSendLoginInfoToHub() {
        if (!this.wechatyBot) {
            return;
        }

        await this._responseLoginDone();
    }
}

module.exports = PadProWechatBotAdapter;
