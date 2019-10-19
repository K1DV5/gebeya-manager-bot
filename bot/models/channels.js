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

    async updatePermissions(channel, admins) {
        // channel: string
        // permissions: {username: {status: string, ...permissions: string}}
        for (let admin of admins) {
            if (admin.status === 'administrator') {
                let username = admin.user.username
                // clear the current one
                await this.sql('DELETE FROM channel_permissions WHERE channel = ? AND person = ?', [channel, username])
                await this.sql(`DELETE FROM people WHERE username = ?
                                    AND username NOT IN (SELECT admin FROM channels)
                                    AND username NOT IN (SELECT person FROM channel_permissions)`,
                    [username])
                // insert anew
                await this.sql('INSERT IGNORE INTO people (username) VALUES (?)', [username])
                let canPost = admin.can_post_messages
                let canChangeSettings = admin.can_change_info
                this.sql('INSERT INTO channel_permissions (channel, person, post, setting) VALUES (?,?,?,?)',
                    [channel, username, canPost, canChangeSettings]
                )
            }
        }
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
