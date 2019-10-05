const mysql = require('mysql')

const INIT_INFO = {
    K1DV5: ['mygeb'] // channel usernames
}

const ADMINS = Object.keys(INIT_INFO)
const CHANNELS = ['mygeb']

let connection = mysql.createConnection({
    host: 'localhost',
    user: 'bot',
    password : 'secret',
    database: 'my_gebeya'
})

connection.connect()

function sql(sql, args) {
    // process sql query and return the result
    return new Promise((resolve) => {
        connection.query(sql, args, (error, results) => {
            if (error) {
                console.log(error.message)
            } else if (results) {
                resolve(results)
            }
        })
    })
}

function updateAdminsChannels() {
    // ensure that admins and channels are up to date
    let queryAdmin = 'INSERT IGNORE INTO admins (username) VALUES '
    for (let i = 0; i < ADMINS.length; i++) {
        queryAdmin += '(?),'
    }
    queryAdmin = queryAdmin.slice(0, -1)
    sql(queryAdmin, ADMINS)

    // channels
    let queryChannel = 'INSERT IGNORE INTO channels (username, admin) VALUES '
    let channelArgs = []
    for (let admin of ADMINS) {
        let channels = INIT_INFO[admin]
        for (let i = 0; i < channels.length; i++) {
            queryChannel += '(?,?),'
            channelArgs.push(channels[i], admin)
        }
    }
    queryChannel = queryChannel.slice(0, -1)
    sql(queryChannel, channelArgs)
}

async function handleStart(ctx) {
    let {id: userId, username} = ctx.update.message.from
    if (ctx.startPayload) {  // a button on a post was clicked
        let messageIdDb = ctx.startPayload.trim()
        console.log(messageIdDb)
        let message = (await sql('SELECT * FROM posts WHERE message_id = ?', [messageIdDb]))[0]
        if (message) {
            let [channel] = messageIdDb.split('/', 1)
            // send messages to both parties.
            let itemText = 'this item'
            let itemLink = `<a href="https://t.me/${messageIdDb}">${itemText}</a>`
            let contactText = (await sql('SELECT contact_text FROM channels WHERE username = ?', [channel]))[0]
            // to the customer
            let text = 'You have selected ' + itemLink + '.\n' + contactText
            ctx.reply(text, {
                parse_mode: 'html',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: 'Details',
                                url: 'https://t.me/MyGebeyaBot'
                            }
                        ]
                    ]
                }
            })
            // to the admin
            let admin = (await sql(`SELECT a.chat_id AS admin
                                    FROM posts AS p
                                    INNER JOIN channels AS c
                                        ON p.channel = c.username
                                    INNER JOIN admins AS a
                                    WHERE message_id = ?`,
                                    [messageIdDb]))[0].admin
            console.log(admin)
            return
            ctx.telegram.sendMessage(admin,
                `You have a <a href="tg://user?id=${userId}">customer</a> who wants to buy <a href="${itemLink}">this item</a> from ${channel}. They may contact you.`)
        } else {
            ctx.reply('No message with that id was found.')
        }
    } else {
        if (ADMINS.includes(username)) {
            // admin exists in db assumed
            sql(`UPDATE admins SET chat_id = ?, draft_stage = ? WHERE username = ?`,
                [ctx.chat.id, 0, username])
            // store the chat id for the username
            ctx.reply('Welcome, now I can talk to you. Please send /post to post a new item.')
        } else {
            let reply = 'Welcome, please go to one of our channels '
            for (let channel of CHANNELS) {
                reply += channel + ', '
            }
            reply = reply.slice(0, -2) +  ' and select "Buy" on an item.'
            ctx.reply(reply)
        }
    }
}

function handlePost(ctx) {
    let userId = ctx.from.id
    let username = ctx.from.username
    if (ADMINS.includes(username)) {
        // increase the stage
        sql(`INSERT INTO sessions (user_id, chat_type, stage)
            values (?, "admin", ?)
            ON DUPLICATE KEY UPDATE stage = ?`,
            [userId, 1, 1])

        // prepare choices
        let channels = INIT_INFO[username]
        let keyboardRows = []
        let keyboardTiles = []
        for (let channel of channels) {
            let channelButton = {
                text: channel,
            }
            if (keyboardTiles.length === 3) {
                keyboardRows.push(keyboardTiles)
                keyboardTiles = [channelButton]
            } else {
                keyboardTiles.push(channelButton)
            }
        }
        ctx.reply('Which channel do you want to post to?', {
            reply_markup: {
                keyboard: keyboardRows,
                resize_keyboard: true,
            }
        })

    } else {
        ctx.reply('You are not registered here as an admin of any channel.')
    }
}

function handleTitleStage(ctx) {
    let userId = ctx.from.id
    // increase the stage
    sql(`INSERT INTO sessions (user_id, chat_type, stage)
        values (?, "admin", ?)
        ON DUPLICATE KEY UPDATE stage = ?`,
        [userId, 3, 3])
    let title = ctx.message.text
    console.log(title)
    ctx.reply('Write the description')
}

function handleDescriptionStage(ctx) {
    let userId = ctx.from.id
    // increase the stage
    sql(`INSERT INTO sessions (user_id, chat_type, stage)
        values (?, "admin", ?)
        ON DUPLICATE KEY UPDATE stage = ?`,
        [userId, 4, 4])
    let description = ctx.message.text
    console.log(description)
    ctx.reply('Send me the photos.')
}

function handlePhotoStage(ctx) {
    // let userId = ctx.from.id
    let username = ctx.from.username
    if (ADMINS.includes(username)) {
        // // increase the stage
        // sql(`INSERT INTO sessions (user_id, chat_type, stage)
        //     values (?, "admin", ?)
        //     ON DUPLICATE KEY UPDATE stage = ?`,
        //     [userId, 4, 4])
        let photos = getPhotos(ctx)
        console.log(photos)
        ctx.reply('Done.')
    }
}

function handleText(ctx) {
    let userId = ctx.from.id
    let username = ctx.from.username
    // get the current stage
    let sessionInfo = (await sql('SELECT stage FROM sessions WHERE user_id = ?', [userId]))[0]
    if (sessionInfo) {
        let stage = sessionInfo.stage
        if (ADMINS.includes(username)) {
            if (stage == 1) {
                let channel = ctx.message.text
                console.log(channel)
                // to the title stage
                handleTitleStage(ctx)
            } else if (stage == 2) {
                // to the description stage
                handleDescriptionStage(ctx)
            } else {
                ctx.reply('Error')
            }
        }
    } else {
        ctx.reply('Error')
    }
}

function stopDB() {
    connection.end()
}

module.exports = {
    updateAdminsChannels,
    handleStart,
    handlePost,
    handleText,
    handleTitleStage,
    handleDescriptionStage,
    handlePhotoStage,
    stopDB
}
