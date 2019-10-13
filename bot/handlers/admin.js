const argparse = require('../utils').argparse

async function handleAdminAdd(ctx) {
    let username = ctx.from.username
    if (ctx.state.admins.includes(username)) {
        let text = ctx.message.text
        let args = argparse(text)
        ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
        if (args.p === '1221') {
            if (args.u && args.c && args.e) {
                await ctx.state.people.insert({username: args.u})
                let licenseExpiry = new Date(args.e)
                ctx.state.channels.insert({
                    username: args.c,
                    admin: args.u,
                    license_expiry: licenseExpiry.getTime()/1000, // by 1000 to convert to seconds
                })
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
