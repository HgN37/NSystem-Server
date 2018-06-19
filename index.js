var net = require('net');
var events = require('events');
var fs = require('fs');
var mysql = require('mysql');
var mqtt = require('mqtt');

var writeSys = []
var writeSock = []

class serverUser {
    constructor(port) {
        var client = []
        var server = net.createServer((socket) => {
            socket.on('data', (data) => {
                var msg = data.toString().slice(0,-1)
                ////console.log(msg)
                this.msgHandler(socket, msg)
            })
        })
        server.listen(port)
    }

    msgHandler(socket, msg) {
        let cmd = {}
        try {
            cmd = JSON.parse(msg.replace(/'/g,'"'))
        }
        catch(error) {
            return
        }
	    ////console.log(JSON.stringify(cmd))
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
                    ////console.log(result.length)
                    for (let i = 0; i < result.length; i++) {
                        temp[i] = {}
                        temp[i]["ID"] = result[i].id
                        temp[i]["NAME"] = result[i].name
                        temp[i]["STATUS"] = result[i].stt
                    }
                    respond["DATA"] = temp
                    ////console.log(respond)
                    socket.write(JSON.stringify(respond) + "\x04")
                }
            })
        }
        else if(cmd['FUNC'] == 'ADDSYS'){
            let queryString = "INSERT INTO sys (id, name, owner, stt) VALUES (\"" + cmd['DATA']['ID'] + "\",\"" + cmd['DATA']['NAME'] + "\",\"" + cmd['USER'] + "\",\"unknown\")"
            ////console.log(queryString)
            db.query(queryString, (err, result) => {
                if (err) throw err;
                else {
                    //console.log(result)
                }
            })
        }
        else if(cmd['FUNC'] == 'READ') {
            console.log(JSON.stringify(cmd))
            let queryString = "SELECT * FROM dev WHERE sys=\"" + cmd['DATA'] + "\""
            db.query(queryString, (err, result) => {
                if (err) throw err
                else {
                    let respond = {}
                    respond["USER"] = cmd["USER"]
                    respond["PASS"] = cmd["PASS"]
                    respond["FUNC"] = "READ"
                    let temp = {}
                    temp["FILE"] = "DEVLIST"
                    temp["RASPID"] = cmd['DATA']
                    for(let i = 0; i < result.length; i++) {
                        let t_addr = result[i].addr
                        temp[t_addr] = {}
                        temp[t_addr]["ID"] = t_addr
                        temp[t_addr]["HARDWARE"] = result[i].hardware
                        temp[t_addr]["VALUE"] = result[i].lastValue
                        //console.log(result[i].lastValue)
                    }
                    respond["DATA"] = temp
                    ////console.log(JSON.stringify(respond))
                    socket.write(JSON.stringify(respond) + "\x04")
                }
            })
        }
        else if(cmd['FUNC'] == 'WRITE') {
            console.log(JSON.stringify(cmd))
            let topic_name = cmd["DATA"]["ADDR"] + "/m2s"
            client.publish(topic_name, JSON.stringify(cmd["DATA"]))
            writeSys.push(cmd['DATA']['ADDR'])
            writeSock.push(socket)
        }
        else if(cmd['FUNC'] == 'RULE') {
            let queryString = "SELECT * FROM rule WHERE sys=\"" + cmd['DATA'] + "\""
            db.query(queryString, (err, result) => {
                if(!err) {
                    let respond = {}
                    respond["USER"] = cmd["USER"]
                    respond["PASS"] = cmd["PASS"]
                    respond["FUNC"] = "RULE"
                    let temp = {}
                    temp["FILE"] = "RULELIST"
                    temp["RASPID"] = cmd['DATA']
                    console.log(respond)
                    for(let i = 0; i < result.length; i++) {
                        let t_addr = result[i].id
                        temp[t_addr] = {}
                        temp[t_addr]["ID"] = result[i].id
                        temp[t_addr]["DEV1"] = result[i].dev1
                        temp[t_addr]["DEV2"] = result[i].dev2
                        temp[t_addr]["VALUE"] = result[i].value
                        temp[t_addr]["UNDER"] = result[i].under
                        temp[t_addr]["OVER"] = result[i].over
                        //console.log(result[i].lastValue)
                    }
                    respond["DATA"] = temp
                    socket.write(JSON.stringify(respond) + "\x04")
                }
            })
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
        let cmd = {}
        try {
            cmd = JSON.parse(msg.replace(/'/g,'"'))
        }
        catch(err) {
            return
        }
        var name_t = ""
        ////console.log(JSON.stringify(cmd))
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
                // Delete old data
                let queryString = "DELETE FROM dev WHERE sys=\"" + cmd["RASPID"] + "\""
                db.query(queryString, (err, result) => {
                    // Nothing to do here
                })
                for (key in cmd) {
                    if (key == "FILE") continue;
                    else if (key == "RASPID") continue;
                    //console.log(name_t)
                    queryString = "INSERT INTO dev (sys, addr, name, hardware, lastValue) VALUES (\""
                    + cmd["RASPID"] + "\","
                    + key.toString() + ","
                    + "\"" + "None" + '",'
                    + cmd[key]["HARDWARE"].toString() + ","
                    + "9999)"
                    //console.log(queryString)
                    db.query(queryString, (err, result) => {
                        if(err) throw err
                    })
                }
            }
            else if(cmd["FILE"] == "RULELIST") {
                //console.log(JSON.stringify(cmd))
                let key
                let queryString = "DELETE FROM rule"
                db.query(queryString, (err, result) => {
                    //Do nothing here
                })
                for (key in cmd) {
                    if (key == "RASPID") continue;
                    if (key == "FILE") continue;
                    let queryString = "INSERT INTO rule (sys, id, dev1, dev2, value, under, over) VALUES "
                    + '("' + cmd["RASPID"] + '",'
                    + key + ','
                    + cmd[key]["DEV1"] + ','
                    + cmd[key]["DEV2"] + ','
                    + cmd[key]["DATA"]["1"] + ','
                    + cmd[key]["DATA"]["2"] + ','
                    + cmd[key]["DATA"]["3"] + ')'
                    db.query(queryString, (err, result) => {
                        //Do nothing here
                    })

                }
            }
        }
    }

    mqttHandler(raspid, cmd) {
        if( this.sysOnline.includes(raspid) ) {
            let queryString = "UPDATE sys SET stt=\"online\" WHERE id=\"" + raspid + "\""
            db.query(queryString, (err, result) => {
                // Nothing to do here
            })
            if(cmd["FUNC"] == "UPDATE") {
                ////console.log(JSON.stringify(cmd))
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
            else if(cmd["FUNC"] == "WRITE") {
                ////console.log(JSON.stringify(cmd))
                let addr = cmd['DEV1']
                let value = cmd['DATA']['1']
                let queryString =   "UPDATE dev SET lastValue=" + value + " WHERE sys=\"" + 
                                    raspid + "\" AND addr=" + addr
                db.query(queryString, (err, result) => {
                    if(err) throw err
                })/*
                let index = writeSys.indexOf(raspid)
                let sock = writeSock[index]
                queryString = "SELECT * FROM dev WHERE sys=\"" + raspid + "\""
                db.query(queryString, (err, result) => {
                    if (err) throw err
                    else {
                        let respond = {}
                        respond["USER"] = 'None'
                        respond["PASS"] = 'None'
                        respond["FUNC"] = "READ"
                        let temp = {}
                        temp["FILE"] = "DEVLIST"
                        temp["RASPID"] = raspid
                        for(let i = 0; i < result.length; i++) {
                            let t_addr = result[i].addr
                            temp[t_addr] = {}
                            temp[t_addr]["ID"] = t_addr
                            temp[t_addr]["HARDWARE"] = result[i].hardware
                            temp[t_addr]["VALUE"] = result[i].lastValue
                            //console.log(result[i].lastValue)
                        }
                        respond["DATA"] = temp
                        ////console.log(JSON.stringify(respond))
                        sock.write(JSON.stringify(respond) + "\x04")
                    }
                })
                writeSys.pop(raspid)
                writeSock.pop(sock)*/
            }
        }
    }
}

user = new serverUser(55555)
rasp = new serverRasp(33333)

var client = mqtt.connect('ws://iot.eclipse.org:80/ws')
client.on('connect', () => {
    //console.log('Connected to MQTT Server')
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