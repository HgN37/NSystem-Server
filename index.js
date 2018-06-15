var net = require('net');
var events = require('events');
var fs = require('fs');
var mysql = require('mysql');
var mqtt = require('mqtt');

class serverUser {
    constructor(port) {
        var client = []
        var server = net.createServer((socket) => {
            socket.on('data', (data) => {
                var msg = data.toString().slice(0,-1)
                //console.log(msg)
                this.msgHandler(socket, msg)
            })
        })
        server.listen(port)
    }

    msgHandler(socket, msg) {
        let cmd = JSON.parse(msg.replace(/'/g,'"'))
        if(cmd['FUNC'] == 'SIGNIN') {
            let queryString = "SELECT * FROM acc WHERE username = '" + cmd["USER"] + "'";
            db.query(queryString, (err, result) => {
                let respond = {}
                respond["USER"] = cmd["USER"]
                respond["PASS"] = cmd["PASS"]
                respond["FUNC"] = "SIGNIN"
                if (err) throw err;
                else {
                    if (result[0].password == cmd["PASS"]) {
                        respond["DATA"] = "OK"
                    }
                    else {
                        respond["DATA"] = "FAIL"
                    }
                    socket.write(JSON.stringify(respond) + "\x04")
                }
            })
        }
        else if(cmd['FUNC'] == 'LISTSYS'){
            let queryString = "SELECT * FROM sys WHERE owner = '" + cmd["USER"] + "'";
            db.query(queryString, (err, result) => {
                let respond = {}
                respond["USER"] = cmd["USER"]
                respond["PASS"] = cmd["PASS"]
                respond["FUNC"] = "LISTSYS"
                if (err) throw err;
                else {
                    var temp = []
                    console.log(result.length)
                    for (let i = 0; i < result.length; i++) {
                        temp[i] = {}
                        temp[i]["ID"] = result[i].id
                        temp[i]["NAME"] = result[i].name
                        temp[i]["STATUS"] = result[i].stt
                    }
                    respond["DATA"] = temp
                    console.log(respond)
                    socket.write(JSON.stringify(respond) + "\x04")
                }
            })
        }
        else if(cmd['FUNC'] == 'ADDSYS'){
            let queryString = "INSERT INTO sys (id, name, owner, stt) VALUES (\"" + cmd['DATA']['ID'] + "\",\"" + cmd['DATA']['NAME'] + "\",\"" + cmd['USER'] + "\",\"unknown\")"
            console.log(queryString)
            db.query(queryString, (err, result) => {
                if (err) throw err;
                else {
                    console.log(result)
                }
            })
        }
        else if(cmd['FUNC'] == 'READ') {

        }
    }
}

class serverRasp {
    constructor(port) {
        this.sysOnline = []
        var server = net.createServer((socket) => {
            socket.on('data', (data) => {
                var msg = data.toString()
                this.msgHandler(socket, msg)
            })
        })
        server.listen(port)
    }

    msgHandler(socket, msg) {
        let cmd = JSON.parse(msg.replace(/'/g,'"'))
        console.log(JSON.stringify(cmd))
        if( !this.sysOnline.includes(cmd["RASPID"]) ){
            this.sysOnline.push(cmd["RASPID"])
            client.subscribe(cmd["RASPID"] + "/s2m")
            // Update status
            let queryString = "UPDATE sys SET stt=\"online\" WHERE id=\"" + cmd["RASPID"] + "\""
            db.query(queryString, (err, result) => {
                // Nothing to do here
            })
        }
        if(cmd.hasOwnProperty("FILE")) {
            if(cmd["FILE"] == "DEVLIST") {
                let key
                for (key in cmd) {
                    if (key == "FILE") continue;
                    if (key == "RASPID") continue;
                    // Delete old data
                    let queryString = "DELETE FROM dev WHERE sys=\"" + cmd["RASPID"] + "\""
                    db.query(queryString, (err, result) => {
                        // Nothing to do here
                    })
                    queryString = "INSERT INTO dev (sys, addr, name, hardware, lastValue) VALUES (\""
                    + cmd["RASPID"] + "\","
                    + key.toString() + ","
                    + "\"None\", " 
                    + cmd[key]["HARDWARE"].toString() + ","
                    + "9999)"
                    db.query(queryString, (err, result) => {
                        if(err) throw err
                    })
                }
            }
        }
    }

    mqttHandler(raspid, cmd) {
        console.log(raspid)
        console.log(cmd)
        if( this.sysOnline.includes(raspid) ) {
            if(cmd["FUNC"] == "UPDATE") {
                //console.log(JSON.stringify(cmd))
                if (cmd['DEV1'] != "0") {
                    let addr = cmd['DEV1']
                    let value = cmd['DATA']['1']
                    let queryString =   "UPDATE dev SET lastValue=" + value + " WHERE sys=\"" + 
                                        raspid + "\" AND addr=" + addr
                    db.query(queryString, (err, result) => {
                        if(err) throw err
                    })
                }
            }
        }
    }
}

user = new serverUser(55555)
rasp = new serverRasp(33333)

var client = mqtt.connect('ws://iot.eclipse.org:80/ws')
client.on('connect', () => {
    console.log('Connected to MQTT Server')
})
client.on('message', (topic, message, package) => {
    let raspid = topic.slice(0,-4)
    let cmd = JSON.parse(message)
    rasp.mqttHandler(raspid, cmd)
})

var db = mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'yoursolution',
    database:'HGN_NSYSTEM'
})
db.connect((err) => {
    if(err) throw err;
})
let queryString = "UPDATE sys SET stt=\"offline\""
db.query(queryString, (err, result) => {
    // Nothing to do here
})