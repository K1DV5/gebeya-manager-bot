function updateAdminsChannels() {
    // ensure that admins and channels are up to date
    let queryAdmin = 'INSERT IGNORE INTO admins (username) VALUES '
    for (let i = 0; i < ADMINS.length; i++) {
        queryAdmin += '(?), '
    }
    queryAdmin = queryAdmin.slice(0, -2)
    sql(queryAdmin, ADMINS)

    // channels
    let queryChannel = 'INSERT IGNORE INTO channels (username, admin) VALUES '
    let channelArgs = []
    for (let admin of ADMINS) {
        let channels = ADMINS[admin]
        for (let i = 0; i < channels.length; i++) {
            queryChannel += '(?, ?), '
            channelArgs.push(channels[i], admin)
        }
    }
    queryChannel = queryChannel.slice(0, -2)
    sql(queryChannel, channelArgs)
}

async function handleStart(ctx) {
    let userId = ctx.from.id
    let username = cts.from.username
    if (Object.keys(ADMINS).includes(username)) {
        sql(`INSERT INTO sessions (user_id, chat_type, stage)
            values (?, "admin", ?)
            ON DUPLICATE KEY UPDATE stage = ?`,
            [userId, 0, 0])
        ctx.reply('Welcome, please input /post to post a new item.')
    } else {
        if (ctx.startPayload) {
            sql(`INSERT INTO sessions (user_id, channel, stage)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE channel = ?, stage = ?`,
                [userId, 0, 0])
            let [channel, messageId] = ctx.startPayload.split('/', 2)
            let message = await sql('SELECT * FROM posts WHERE message_id = ?', [messageId])[0]
            // to the customer
            let chatId = ctx.message.chat.id
            ctx.telegram.sendPhoto(chatId, message.image_posted, `${message.title}\n\n${message.body}`)
            ctx.reply('To buy this item, contact @' + ADMINS[0] + '.')
            // to the admin
            let admin = await sql(
                `SELECT a.username AS admin
                FROM posts AS p
                WHERE message_id = ?
                INNER JOIN channels AS c
                    ON p.channel = c.username
                INNER JOIN admins AS a`,
                [channel + '/' + messageId])[0].admin
            ctx.telegram.sendPhoto(admin,
                message.image_posted,
                `${message.title}\n\n${message.body}\n\n` + ctx.message.from.username + ' may contact you.')
        } else {
            ctx.reply('Welcome, please go to one of our channels ' + CHANNELS[0] + 'and select Buy on an item.')
        }
    }
}

function handlePost(ctx) {
    let userId = ctx.from.id
    let username = cts.from.username
    if (ADMINS.includes(username)) {
        // increase the stage
        sql(`INSERT INTO sessions (user_id, chat_type, stage)
            values (?, "admin", ?)
            ON DUPLICATE KEY UPDATE stage = ?`,
            [userId, 1, 1])
        ctx.reply('Which channel do you want to post to?')
    }
}

function handleChannelStage(ctx) {
    let userId = ctx.from.id
    let username = cts.from.username
    if (ADMINS.includes(username)) {
        // increase the stage
        sql(`INSERT INTO sessions (user_id, chat_type, stage)
            values (?, "admin", ?)
            ON DUPLICATE KEY UPDATE stage = ?`,
            [userId, 2, 2])
        let channel = ctx.startPayload
        console.log(channel)
        ctx.reply('What is the title?')
    }
}

function handleTitleStage(ctx) {
    let userId = ctx.from.id
    let username = cts.from.username
    if (ADMINS.includes(username)) {
        // increase the stage
        sql(`INSERT INTO sessions (user_id, chat_type, stage)
            values (?, "admin", ?)
            ON DUPLICATE KEY UPDATE stage = ?`,
            [userId, 3, 3])
        let title = ctx.message.text
        console.log(title)
        ctx.reply('Write the description')
    }
}

function handleDescriptionStage(ctx) {
    let userId = ctx.from.id
    let username = cts.from.username
    if (ADMINS.includes(username)) {
        // increase the stage
        sql(`INSERT INTO sessions (user_id, chat_type, stage)
            values (?, "admin", ?)
            ON DUPLICATE KEY UPDATE stage = ?`,
            [userId, 4, 4])
        let description = ctx.message.text
        console.log(description)
        ctx.reply('Send me the photos.')
    }
}

function handlePhotoStage(ctx) {
    // let userId = ctx.from.id
    let username = cts.from.username
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

