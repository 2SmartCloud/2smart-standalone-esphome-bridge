const events = require('events');
const net = require('net');
const Aedes = require('aedes');

class AedesServer extends events {
    constructor({ port, username: authUsername, password: authPassword, debug }) {
        super();
        this.port = port;
        this.aedes = new Aedes();
        this.server = net.createServer(this.aedes.handle);
        this.aedes.authenticate = (client, username, password, cb) => {
            cb(null,
                (!authUsername || username === authUsername) && (!authPassword || password.toString() === authPassword)
            );
        };
        this.debug = debug;
    }
    init() {
        this.server.listen(this.port, '0.0.0.0', err => {
            if (err) this.emit('exit', err);
            else this.debug.info(`aedes listening on port ${this.port}`);
        });
    }
    destroy() {
        this.server.end();
    }
}
module.exports = AedesServer;
