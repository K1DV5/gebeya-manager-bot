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
            'description_bullet'
        ]
        super(table, cols)
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

    async getPosters(channel) {
        let posters = await this.sql('SELECT person FROM post_permissions WHERE channel = ?', [channel])
        return posters.map(p => p.person)
    }

    async addPoster(channel, person) {
        await this.sql('INSERT IGNORE INTO people (username) VALUES (?)', [person])
        this.sql('INSERT IGNORE INTO post_permissions (channel, person) VALUES (?,?)', [channel, person])
    }

    async revokePoster(channel, person) {
        await this.sql('DELETE FROM post_permissions WHERE channel = ? AND person = ?', [channel, person])
        this.sql(`DELETE FROM people WHERE username = ?
                    AND username NOT IN (SELECT admin FROM channels)
                    AND username NOT IN (SELECT person FROM post_permissions)`,
        [person])
    }
}

// let c = new channels()
// c.addPoster('mygeb', 'kid').then(()=> {
// c.getPosters('mygeb').then(console.log)
// })
// c.revokePoster('mygeb', 'kid').then(()=>{
// c.getPosters('mygeb').then(console.log)
// })

module.exports = channels
