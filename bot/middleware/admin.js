const argparse = require('../utils').argparse

async function handleAdminAdd(ctx) {
    let username = ctx.from.username
    if (ctx.state.admins.includes(username)) {
        let text = ctx.message.text
        let args = argparse(text)
        ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
        if (args.p === '1221') {
            if (args.u && args.c && args.e) {
                await ctx.state.sql('INSERT IGNORE INTO people (username) VALUES (?)', [args.u])
                let licenseExpiry = new Date(args.e)
                ctx.state.sql(`INSERT INTO channels (username, admin, license_expiry) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE admin = VALUES(admin),
                                             license_expiry = VALUES(license_expiry),
                                             contact_text = CONCAT("To buy this item, contact @", VALUES(admin), ".")`,
                    [args.c, args.u, licenseExpiry.getTime()/1000]) // by 1000 to convert to seconds
                ctx.reply(`New channel @${args.c} by @${args.u} added, license expiring on ${licenseExpiry.toString()}`)
            } else {
                ctx.reply('Necessary arguments not given: -u, -c, -e, -p')
            }
        } else {
            ctx.reply(ctx.state.fallbackReply)
        }
    } else {
        ctx.reply(ctx.state.fallbackReply)
    }
}

module.exports = handleAdminAdd
