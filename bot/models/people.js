const BaseModel = require('./base')

class people extends BaseModel {
    constructor(dbConn) {
        let table = 'people'
        let cols = ['username',
                    'chat_id',
                    'draft_title',
                    'draft_description',
                    'draft_price',
                    'draft_destination',
                    'draft_image_ids',
                    'removed_message_ids',
                    'preview_post_message_id',
                    'settings_channel',
                    'conversation',
                    ]
        super(dbConn, table, cols)
    }

    async getConvo(username) {
        return (await this.get(username, ['conversation'])).conversation
    }

    async getDraft(username, purpose) {
        let adminData
        if (purpose === undefined) { // general
            let query = `SELECT p.username,
                                p.chat_id,
                                p.draft_destination AS destination,
                                p.draft_title AS title,
                                p.draft_description AS description,
                                p.draft_price as price,
                                p.draft_image_ids AS images,
                                p.preview_post_message_id as previewId,
                                p.removed_message_ids as removedIds,
                                p.conversation as stage,
                                c.caption_template AS template,
                                c.description_bullet as bullet
                         FROM people AS p
                         INNER JOIN channels AS c
                            ON c.username = p.draft_destination
                         WHERE p.username = ?`
            adminData = (await this.sql(query, [username]))[0]
        } else if (purpose === 'edit') { // for the edit caption functionality
            // get the channel's caption template
            let channel = (await this.sql('SELECT draft_destination FROM people WHERE username = ?', [username]))[0].draft_destination.split('/')[0]
            let channelData = (await this.sql('SELECT caption_template, description_bullet FROM channels WHERE username = ?', [channel]))[0]
            let query = `SELECT draft_destination as destination,
                                draft_title AS title,
                                draft_description AS description,
                                draft_price AS price,
                                draft_image_ids AS images,
                                removed_message_ids as removedIds,
                                conversation AS stage
                         FROM people WHERE username = ?`
            adminData = (await this.sql(query, [username]))[0]
            adminData.template = channelData.caption_template
            adminData.bullet = channelData.description_bullet
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
                                    draft_destination = NULL,
                                    draft_image_ids = NULL,
                                    removed_message_ids = NULL,
                                    preview_post_message_id = NULL,
                                    conversation = NULL
             WHERE username = ?`, [username])
    }

    async getChannels(username, licenseValidOn) {
        let query = `SELECT c.username, c.license_expiry
                     FROM channels as c
                     INNER JOIN people AS p
                     ON p.username = c.admin
                     WHERE p.username = ?`
        let channelsInfo = await this.sql(query, [username])
        let channels = channelsInfo.filter(ch => ch.license_expiry*1 > licenseValidOn).map(ch => ch.username)
        return channels
    }

}

// p = new people()
// p.getConvo('K1DV5').then(console.log)
// p.exists('K1DV5').then(console.log)

module.exports = people
