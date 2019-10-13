const BaseModel = require('./base')

class channels extends BaseModel {
    constructor() {
        let table = 'channels'
        let cols = [
            'username',
            'admin',
            'contact_text',
            'caption_template',
            'sold_template',
            'license_expiry',
        ]
        super(table, cols)
    }

    async getUsernames() {
        return (await this.sql('SELECT username FROM ' + this.table)).map(ch => ch.username)
    }
}

// let c = new channels()
// c.getUsernames().then(console.log)

module.exports = channels
