const BaseModel = require('./base')

class posts extends BaseModel {
    constructor() {
        let cols = [
            'message_id',
            'channel',
            'author',
            'title',
            'description',
            'price',
            'state',
            'caption',
            'image_ids',
            'state',
            'marked_sold',
            'post_date',
            'sold_date',
            'interested'
        ]
        super('posts', cols)
    }

    delete(messageId) {
        this.sql('UPDATE posts SET state = "deleted" WHERE message_id = ?', [messageId])
    }

    async getAdmin(channel, messageId) {
        return (await this.sql(`SELECT a.username FROM posts AS p
                                    INNER JOIN channels AS c
                                        ON p.channel = c.username
                                    INNER JOIN people AS a
                                        ON c.admin = a.username
                                    WHERE channel = ? AND message_id = ?`, [channel, messageId]))[0].username
    }

    async getUsernames() {
        return await this.sql('SELECT username FROM people')
    }

    async setNotif(notifs) {
        if (notifs.length) {
            // notifs: [{person: username, channel: username, post: postId, id: message_id}...]
            let query = 'INSERT INTO notifications (channel, post_id, message_id, person) VALUES '
            let values = []
            for (let notif of notifs) {
                query += '(?,?,?,?),'
                values.push(notif.channel, notif.post_id, notif.id, notif.person)
            }
            query = query.slice(0, query.length - 1) + ' ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)'
            await this.sql(query, values)
        }
    }

    async getNotif(channel, postId) {
        let query = 'SELECT person, message_id FROM notifications WHERE channel=? AND post_id=?'
        return await this.sql(query, [channel, postId])
    }

    async deleteNotif(channel, postId) {
        let query = 'DELETE FROM notifications WHERE channel=? AND post_id=?'
        await this.sql(query, [channel, postId])
    }
}

// let p = new posts()
// p.get('mygeb/126').then(console.log)

module.exports = posts
