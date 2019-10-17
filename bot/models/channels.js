const BaseModel = require('./base')

class channels extends BaseModel {
    constructor(dbConn) {
        let table = 'channels'
        let cols = [
            'username',
            'admin',
            'contact_text',
            'caption_template',
            'sold_template',
            'license_expiry',
        ]
        super(dbConn, table, cols)
    }

    async licenseIsValid(username, asOf) {
        let expiry = await this.get(username, 'license_expiry')
        if (expiry * 1 > asOf * 1) {
            return true
        }
        return false
    }

    async getUsernames() {
        return (await this.sql('SELECT username FROM ' + this.table)).map(ch => ch.username)
    }
}

// let c = new channels()
// c.getUsernames().then(console.log)

module.exports = channels
