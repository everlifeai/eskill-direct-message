'use strict'
const cote = require('cote')
const u = require('elife-utils')

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

function sendMsgOnDefaultChannel(msg, req) {
    req.type = 'reply-on-default-channel'
    req.msg = msg
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
    }, (err) => {
        if(err) u.showErr(err)
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

        const msg = req.msg.trim()
        const userID = msg.trim().split(" ")[0]
        const userMsg = msg.replace(userID,'').trim()
        console.log(`USER ID : ${userID}`)
        console.log(`USER MSG : ${userMsg}`)
        if(userID.startsWith("@") 
            && userID.endsWith(".ed25519") && userMsg.length>0){
                directMessage(req,userID,userMsg,(err)=>{
                    cb(null,true)
                    if(err) {
                        sendReply(err,req)    
                    }else {
                        sendReply(`Message sent to ${userID}`,req)
                    }
                }
                )
        } else cb()

    })

    let now = (new Date()).getTime() // TODO: Find better way of getting latest messages
    svc.on('ssb-msg', (req, cb) => {
        cb()
        if(req.msg.timestamp > now) console.log(req)
    })

}

const client = new cote.Requester({
    name: 'Direct-Msg -> SSB',
    key: 'everlife-ssb-svc',
})

function directMessage(req, userID,userMsg,cb) {
    client.send({ type: 'new-pvt-msg', to: userID, msg: { type: "direct-msg", text: userMsg } }, (err) => {
        if(err) cb(err)
        else {
            console.log('posted message');
            client.send({
                type: 'dump-msgs',
                opts: {
                    showPvt: true,
                    showCnt: false,
                    showAth: false,
                },
            }, (err, msgs) => {
                if(err) u.showErr(err)
                else u.showMsg(msgs)
            })
        }
    })
}

main()
