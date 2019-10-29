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
        this.permTable = 'channel_permissions'
        this.permCols = [
            'person',
            'channel',
            'post',
            'setting',
            'edit_others',
            'delete_others',
        ]
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

    async updatePermissions(channel, admins, exclude) {
        // channel: string
        // permissions: {username: {status: string, ...permissions: string}}
        await this.sql('DELETE FROM channel_permissions WHERE channel = ?', [channel])
        const adminHere = await this.get(channel, 'admin')
        for (let admin of admins) {
            if (['administrator', 'creator'].includes(admin.status)) {
                let username = admin.user.username
                if (username === exclude || username === adminHere) {
                    continue
                }
                // clear the current one
                await this.sql(`DELETE FROM people WHERE username = ?
                                    AND username NOT IN (SELECT admin FROM channels)
                                    AND username NOT IN (SELECT person FROM channel_permissions)`,
                    [username])
                // insert anew
                await this.sql('INSERT IGNORE INTO people (username) VALUES (?)', [username])
                let canPost
                let canChangeSettings
                let canEditOtherPosts
                let canDeleteOtherPosts
                if (admin.status === 'creator') {
                    canPost = true
                    canChangeSettings = true
                    canEditOtherPosts = true
                    canDeleteOtherPosts = true
                } else {
                    canPost = admin.can_post_messages
                    canChangeSettings = admin.can_change_info
                    canEditOtherPosts = admin.can_edit_messages
                    canDeleteOtherPosts = admin.can_delete_messages
                }
                this.sql('INSERT INTO channel_permissions (channel, person, post, setting, edit_others, delete_others) VALUES (?,?,?,?,?,?)',
                    [channel, username, canPost, canChangeSettings, canEditOtherPosts, canDeleteOtherPosts]
                )
            }
        }
    }

    async getPermitted(channel, cols) { // get people with permissions (admins on telegram)
        let columns
        if (Array.isArray(cols)) {
            columns = cols.filter(col => this.permCols.includes(col)).join(',')
        } else if (!(typeof cols === 'string' && this.permCols.includes(cols))) {
            columns = '*'
        }
        let withPermissions = await this.sql('SELECT ' + columns + ' FROM ' + this.permTable + ' WHERE channel=?', [channel])
        return withPermissions
    }
}

// let c = new channels()
// c.addPoster('mygeb', 'kid').then(()=> {
// c.getPosters('mygeb').then(console.log)
// })
// c.revokePoster('mygeb', 'kid').then(()=>{
// c.getPosters('mygeb').then(console.log)
// })
// c.getPermitted('mygeb').then(console.log)

module.exports = channels
