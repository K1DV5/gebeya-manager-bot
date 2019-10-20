const {argparse} = require('../utils')

async function handleAdminAdd(ctx) {
    let text = ctx.message.text
    let args = argparse(text)
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id)
    if (args.p === '1221') {
        if (args.u && args.c && args.e) {
            let admins
            try {
                admins = await ctx.telegram.getChatAdministrators('@' + args.c + 'eya')
            } catch(err) {
                if (err.code === 400) {
                    ctx.reply(err.description + '\n\nMaybe the bot is not added to the channel')
                } else {
                    ctx.reply(err.code)
                }
                return
            }
            await ctx.people.insert({username: args.u})
            let licenseExpiry = new Date(args.e)
            ctx.channels.insert({
                username: args.c,
                admin: args.u,
                license_expiry: licenseExpiry.getTime()/1000, // by 1000 to convert to seconds
            })
            // set permissions for other admins
            await ctx.channels.updatePermissions(args.c, admins, ctx.botInfo.username)

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
