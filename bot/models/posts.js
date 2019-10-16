const BaseModel = require('./base')

class posts extends BaseModel {
    constructor(dbConn) {
        let cols = [
            'message_id',
            'channel',
            'title',
            'description',
            'price',
            'state',
            'caption',
            'image_ids',
            'state',
            'marked_sold',
            'post_date',
            'sold_date'
        ]
        super(dbConn, 'posts', cols)
    }

    delete(messageId) {
        this.sql('UPDATE posts SET state = "deleted" WHERE message_id = ?', [messageId])
    }

    async getAdmin(messageId) {
        return (await this.sql(`SELECT a.username FROM posts AS p
                                    INNER JOIN channels AS c
                                        ON p.channel = c.username
                                    INNER JOIN people AS a
                                        ON c.admin = a.username
                                    WHERE message_id = ?`, [messageId]))[0]
    }

    async getUsernames() {
        return await this.sql('SELECT username FROM people')
    }
}

// let p = new posts()
// p.get('mygeb/126').then(console.log)

module.exports = posts
