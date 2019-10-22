const BaseModel = require('./base')

class people extends BaseModel {
    constructor() {
        let table = 'people'
        let cols = ['username',
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
                                c.description_bullet as bullet
                         FROM people AS p
                         INNER JOIN channels AS c
                            ON c.username = p.to_update
                         WHERE p.username = ?`
            let result = (await this.sql(query, [username]))[0]
            let incomplete = [result.title, result.description, result.price].some(data => data === null)
            if (!incomplete) {
                adminData = result
            }
        } else if (purpose === 'edit') { // for the edit caption functionality
            // get the channel's caption template
            let channel = (await this.sql('SELECT to_update FROM people WHERE username = ?', [username]))[0].to_update.split('/')[0]
            let channelData = (await this.sql('SELECT caption_template, description_bullet FROM channels WHERE username = ?', [channel]))[0]
            let query = `SELECT to_update as destination,
                                draft_title AS title,
                                draft_description AS description,
                                draft_price AS price,
                                draft_image_ids AS images,
                                removed_message_ids as removedIds,
                                conversation AS stage
                         FROM people WHERE username = ?`
            let result = (await this.sql(query, [username]))[0]
            let incomplete = [result.title, result.description, result.price].some(data => data === null)
            if (!incomplete) {
                adminData = result
                adminData.template = channelData.caption_template
                adminData.bullet = channelData.description_bullet
            }
        }
        if (adminData) {
            adminData.caption = adminData.template
                .replace(/:title\b/, adminData.title)
                .replace(/:description\b/, adminData.description.replace(/^\./gm, adminData.bullet))
                .replace(/:price\b/, adminData.price)
            adminData.images = adminData.images ? JSON.parse(adminData.images) : null
            adminData.removedIds = adminData.removedIds ? JSON.parse(adminData.removedIds) : null
            return adminData
        }
        console.log('Not found')
    }

    clearDraft(username) {
        this.sql(`UPDATE people SET draft_title = NULL,
                                    draft_description = NULL,
                                    to_update = NULL,
                                    draft_image_ids = NULL,
                                    removed_message_ids = NULL,
                                    conversation = NULL
             WHERE username = ?`, [username])
    }

    async getChannels(username, licenseValidOn, purpose) {
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
        }
        let channelsInfo = await this.sql(query, values)
        if (licenseValidOn) {
            let channels = channelsInfo
                .filter(ch => ch.license_expiry*1 > licenseValidOn*1)
                .map(ch => ch.username)
            return channels
        }
        return channelsInfo
    }
}

p = new people()
// p.getConvo('K1DV5').then(console.log)
// p.exists('K1DV5').then(console.log)
// p.getChannels('kid',null,'post').then(console.log)

module.exports = people
