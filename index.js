'use strict'
const cote = require('cote')({statusLogsEnabled:false})
const u = require('@elife/utils')

/*      understand/
 * This is the main entry point where we start.
 *
 *      outcome/
 * Start our microservice and register with the communication manager
 * and SSB.
 */
function main() {
    startMicroservice()
    registerWithCommMgr()
    registerWithSSB()
    getAvatarID()
}

const commMgrClient = new cote.Requester({
    name: 'direct-message -> CommMgr',
    key: 'everlife-communication-svc',
})

function sendReply(msg, req) {
    req.type = 'reply'
    req.msg = msg
    commMgrClient.send(req, (err) => {
        if(err) u.showErr(err)
    })
}

function sendMsgOnLastChannel(req) {
    req.type = 'reply-on-last-channel'
    commMgrClient.send(req, (err) => {
        if(err) u.showErr(err)
    })
}

let msKey = 'everlife-dir-msg-svc'
/*      outcome/
 * Register ourselves as a message handler with the communication
 * manager.
 */
function registerWithCommMgr() {
    commMgrClient.send({
        type: 'register-msg-handler',
        mskey: msKey,
        mstype: 'msg',
        mshelp: [ { cmd: '/send_msg', txt: 'send a direct message to another avatar' } ],
    }, (err) => {
        if(err) u.showErr(err)
    })
}

const ssbClient = new cote.Requester({
    name: 'direct-message -> SSB',
    key: 'everlife-ssb-svc',
})

/*      outcome/
 * Register ourselves as a feed consumer with the SSB subsystem
 */
function registerWithSSB() {
    ssbClient.send({
        type: 'register-feed-handler',
        mskey: msKey,
        mstype: 'ssb-msg',
    }, (err) => {
        if(err) u.showErr(err)
    })
}

/*      outcome/
 * Get the avatar id
 */
let avatarid
function getAvatarID() {
    ssbClient.send({ type: 'avatar-id' }, (err, id) => {
        if(err) u.showErr(err)
        else avatarid = id
    })
}

let directMsgHandlerRegistry = []

function startMicroservice() {

    /*      understand/
     * The microservice (partitioned by key to prevent
     * conflicting with other services.
     */
    const svc = new cote.Responder({
        name: 'Direct Msg Service',
        key: msKey,
    })

    svc.on('msg', (req, cb) => {
        if(!req.msg) return cb()
        let msg = req.msg
        if(!msg.startsWith('/send_msg ')) return cb()

        msg = msg.substr('/send_msg '.length)
        msg = msg.trim()

        let p = msg.indexOf(" ")
        if(p < 1) return cb()

        let userID = msg.substr(0, p)
        let userMsg = msg.substr(p+1)
        if(!(userID.startsWith("@") &&
             userID.endsWith(".ed25519") &&
             userMsg.length > 0)) return cb()

        directMessage(req, userID, userMsg, (err) => {
            if(err) cb(err)
            else {
                cb(null, true)
                sendReply(`Message posted for ${userID}`, req)
            }
        })

    })

    svc.on('ssb-msg', (req, cb) => {
        cb()
        processMsg(req.msg)
    })

    svc.on('register-direct-msg-handler', (req, cb) => {
        if(!req.mskey || !req.mstype) cb(`mskey & mstype needed to register feed handler`)
        else {
            if(isRegistered(req.mskey)) return cb()
            let client = new cote.Requester({
              name: `Direct Msg -> ${req.mskey}`,
              key: req.mskey,
            })
            directMsgHandlerRegistry.push({client: client, mstype: req.mstype})
            cb()
        }
    })

}

function isHandling(skill, msg, cb) {
    skill.client.send({type: 'direct-msg', msg: msg }, cb)
}

function isRegistered(mskey) {
    for (let i=0; i<directMsgHandlerRegistry.length; i++) {
        if (directMsgHandlerRegistry[i].mskey === mskey) return true
    }
    return false
}

let CURRENT_HANDLER

function handleDirectMsg(msg, cb) {
    check_handler_ndx_1(0)

    function check_handler_ndx_1(ndx) {
        if(ndx < directMsgHandlerRegistry.length) {
            isHandling(directMsgHandlerRegistry[ndx], msg, (err, handling) => {
                if(err) u.showErr(err)
                else {
                    if(handling) {
                        CURRENT_HANDLER = directMsgHandlerRegistry[ndx]
                        cb(null, true)
                    } else check_handler_ndx_1(ndx+1)
                }
            })
        } else {
            sendMsgOnLastChannel({
                msg: msg.value.author + ' says:\n' + msg.value.content.text,
            })
            cb(null, true)
        }
    }
}


/*      outcome/
 * If this is a message directed to me, relay it to my owner over the
 * last used channel
 */
function processMsg(msg) {
    if(msg.value.content.type == 'direct-msg' && msg.value.content.to == avatarid) {
        handleDirectMsg(msg, (err, success) => {
            if(err) u.showErr(err)
        })
    }
}

/*      outcome/
 * Post a 'direct message' to someone on my feed and let the network
 * replicate it to the recipient
 */
function directMessage(req, userID, userMsg, cb) {
    ssbClient.send({
        type: 'new-msg',
        msg: {
            type: "direct-msg",
            to: userID,
            text: userMsg
        },
    }, cb)
}

main()
