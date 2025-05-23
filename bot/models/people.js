const BaseModel = require('./base')

class people extends BaseModel {
    constructor() {
        let table = 'people'
        let cols = ['username',
                    'chat_id',
                    'draft_title',
                    'draft_description',
                    'draft_price',
                    'to_update',
                    'draft_image_ids',
                    'removed_message_ids',
                    'settings_channel',
                    'conversation',
                    ]
        super(table, cols)
    }

    async getConvo(username) {
        return (await this.get(username, ['conversation'])).conversation
    }

    async getDraft(username, purpose) {
        let adminData
        if (purpose === undefined) { // general
            let query = `SELECT p.username,
                                p.to_update AS destination,
                                p.draft_title AS title,
                                p.draft_description AS description,
                                p.draft_price as price,
                                p.draft_image_ids AS images,
                                p.removed_message_ids as removedIds,
                                p.conversation as stage,
                                c.caption_template AS template,
                                c.description_bullet as bullet,
                                c.description_is_bullet as useBullets
                         FROM people AS p
                         INNER JOIN channels AS c
                            ON c.username = p.to_update
                         WHERE p.username = ?`
            let result = (await this.sql(query, [username]))[0]
            let incomplete = result.description === null
            if (!incomplete) {
                adminData = result
            }
        } else if (purpose === 'edit') { // for the edit caption functionality
            let query = `SELECT to_update as destination,
                                draft_title AS title,
                                draft_description AS description,
                                draft_price AS price,
                                draft_image_ids AS images,
                                removed_message_ids as removedIds,
                                conversation AS stage
                         FROM people WHERE username = ?`
            let result = (await this.sql(query, [username]))[0]
            let incomplete = result.description === null
            if (!incomplete) {
                adminData = result
                // get the channel's caption template
                let channel = result.destination.split('/')[0]
                let channelData = (await this.sql('SELECT caption_template, description_bullet, description_is_bullet FROM channels WHERE username = ?', [channel]))[0]
                adminData.template = channelData.caption_template
                adminData.bullet = channelData.description_bullet
                adminData.useBullets = channelData.description_is_bullet
            }
        }
        if (!adminData) {
            console.log('Not found')
            return
        }
        adminData.caption = adminData.template
            .replace(/:title\b/, '<b>' + adminData.title + '</b>')
            .replace(/:price\b/, '<code>' + adminData.price + '</code>')
        if (adminData.useBullets) { // use bullets for every line without .
            adminData.caption = adminData.caption
                .replace(/:description\b/, adminData.description
                                            .replace(/^(?=[^.])/gm, adminData.bullet)
                                            .replace(/^\./gm, '')
                )
        } else { // use bullets for lines beginning with .
            adminData.caption = adminData.caption
                .replace(/:description\b/, adminData.description.replace(/^\./gm, adminData.bullet))
        }
        adminData.images = adminData.images ? JSON.parse(adminData.images) : null
        adminData.removedIds = adminData.removedIds ? JSON.parse(adminData.removedIds) : null
        return adminData
    }

    clearDraft(username) {
        this.sql(`UPDATE people SET draft_title = NULL,
                                    draft_description = NULL,
                                    draft_price = NULL,
                                    to_update = NULL,
                                    draft_image_ids = NULL,
                                    removed_message_ids = NULL,
                                    conversation = NULL
             WHERE username = ?`, [username])
    }

    async getChannels(username, licenseValidOn, purpose='post') {
        let query = `SELECT c.username, c.license_expiry
                         FROM channels as c
                             INNER JOIN people AS p
                         ON p.username = c.admin
                         WHERE p.username = ?`
        let values = [username]
        if (purpose === 'post') {
            query += ` UNION SELECT c.username, c.license_expiry
                            FROM channel_permissions AS cp
                            INNER JOIN channels AS c
                                ON cp.channel = c.username
                                AND cp.post IS TRUE
                            WHERE cp.person = ?`
            values.push(username)
        } else if (purpose === 'setting') {
            query += ` UNION SELECT c.username, c.license_expiry
                            FROM channel_permissions AS cp
                            INNER JOIN channels AS c
                                ON cp.channel = c.username
                                AND cp.setting IS TRUE
                            WHERE cp.person = ?`
            values.push(username)
        } else if (purpose === 'permitted') {
            query = `SELECT c.username, c.license_expiry
                            FROM channel_permissions AS cp
                            INNER JOIN channels AS c
                                ON cp.channel = c.username
                                AND cp.setting IS TRUE
                            WHERE cp.person = ?`
            values.push(username)
        }
        let channelsInfo = await this.sql(query, values)
        if (licenseValidOn) {
            let channels = channelsInfo
                .filter(ch => ch.license_expiry*1 > licenseValidOn*1)
                .map(ch => ch.username)
            return channels
        }
        return channelsInfo.length ? channelsInfo : null
    }

    async getAll(cols) {
        if (typeof cols === 'string') {
            cols = [cols]
        } else if (!Array.isArray(cols)) {
            cols = []
        }
        let columns = this.cols.filter(c => cols.includes(c))
        let query = 'SELECT ' + (columns.length ? columns.join(',') : '*') + ' FROM ' + this.table
        let result = await this.sql(query)
        if (cols.length === 1 && columns.length === 1) {
            return result.filter(r => r[columns[0]]).map(r => r[columns[0]])
        }
        return result
    }
}

// let p = new people()
// p.getConvo('K1DV5').then(console.log)
// p.exists('K1DV5').then(console.log)
// p.getChannels('K1DV5',null,'permitted').then(console.log)
// p.get('K1DV5', 'removed_message_ids').then(console.log)
// p.getAll('chat_id').then(console.log)
// p.getDraft('K1DV5', 'edit').then(console.log)

module.exports = people
