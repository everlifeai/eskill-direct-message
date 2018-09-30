'use strict'
const cote = require('cote')
const u = require('elife-utils')

let ssbid

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

let msKey = 'everlife-dir-msg-demo-svc'
/*      outcome/
 * Register ourselves as a message handler with the communication
 * manager.
 */
function registerWithCommMgr() {
    commMgrClient.send({
        type: 'register-msg-handler',
        mskey: msKey,
        mstype: 'msg',
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
    }, (err, ssbid_) => {
        if(err) u.showErr(err)
        else ssbid = ssbid_
    })
}

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

        let msg = req.msg.trim()
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

    let now = (new Date()).getTime() // TODO: Find better way of getting latest messages
    svc.on('ssb-msg', (req, cb) => {
        cb()
        if(req.msg.timestamp > now) processMsg(req.msg)
    })

}


/*      outcome/
 * If this is a message directed to me, relay it to my owner over the
 * last used channel
 */
function processMsg(msg) {
    if(msg.value.content.type == 'direct-msg' && msg.value.content.to == ssbid) {
        sendMsgOnLastChannel({
            msg: msg.value.author + ' says:\n' + msg.value.content.text,
        })
    }
}


const client = new cote.Requester({
    name: 'Direct-Msg -> SSB',
    key: 'everlife-ssb-svc',
})

function directMessage(req, userID, userMsg, cb) {
    client.send({
        type: 'new-msg',
        msg: {
            type: "direct-msg",
            to: userID,
            text: userMsg
        },
    }, cb)
}

main()
