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
            'post_date',
            'sold_date',
            'interested'
        ]
        super('posts', cols)
        this.archiveTable = 'posts_archive'
        // unnecessary cols for archived posts
        this.archiveCols = this.cols.filter(col => !['state', 'caption'].includes(col))
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

    async renew(channel, oldId, newId, newAuthor) {
        // used for reposting where the old post is not needed anymore but may be editted in the future
        // archives the old post
        let colsPart = this.archiveCols.join(',')
        // copy the data to the archive table
        let copyQuery = `INSERT IGNORE INTO posts_archive (${colsPart}) SELECT ${colsPart} FROM ${this.table} WHERE channel=? AND message_id=?`
        await this.sql(copyQuery, [channel, oldId])
        // change the message_id in the main table
        let query = `UPDATE ${this.table} SET message_id=?, author=? WHERE channel=? AND message_id=?`
        await this.sql(query, [newId, newAuthor, channel, oldId])
    }
}

// let p = new posts()
// p.get('mygeb/126').then(console.log)
// p.renew('mygeb', 320, 200).then(console.log)

module.exports = posts
