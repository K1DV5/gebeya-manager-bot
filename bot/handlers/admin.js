const argparse = require('../utils').argparse

async function handleAdminAdd(ctx) {
    let text = ctx.message.text
    let args = argparse(text)
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
    if (args.p === '1221') {
        if (args.u && args.c && args.e) {
            await ctx.people.insert({username: args.u})
            let licenseExpiry = new Date(args.e)
            ctx.channels.insert({
                username: args.c,
                admin: args.u,
                license_expiry: licenseExpiry.getTime()/1000, // by 1000 to convert to seconds
            })
            await ctx.channels.updatePermissions(channel, admins)
            ctx.reply(`New channel @${args.c} by @${args.u} added, license expiring on ${licenseExpiry.toString()}`)
        } else {
            ctx.reply('Necessary arguments not given: -u, -c, -e, -p')
        }
    } else {
        ctx.reply(ctx.fallbackReply)
    }
}

module.exports = {
    handleAdminAdd
}
