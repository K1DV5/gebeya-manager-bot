const {argparse} = require('../utils')
const {deleteMessage} = require('./notify')

// start parameter for refreshing chat id link
const startParam = 'refresh'

async function handleAdminAdd(ctx) {
    let text = ctx.message.text
    let args = argparse(text)
    deleteMessage(ctx, ctx.chat.id, ctx.message.message_id)
    if (args.p === '1221') {
        if (args.u && args.c && args.e) {
            // ensure already registered is not modified unknowingly
            let existingAdnin = await ctx.channels.get(args.c, 'admin')
            if (existingAdnin && existingAdnin !== args.u && !args.f) {
                ctx.reply('The channel @' + args.c + ' already has another admin, @' + existingAdnin + '. Add -f to override.')
                return
            }
            let admins
            try { // to check if the bot is an admin
                admins = await ctx.telegram.getChatAdministrators('@' + args.c)
            } catch(err) {
                if (err.code === 400) {
                    await ctx.reply(err.description + '\n\nMaybe the bot is not added to the channel, or the channel doesn\'t exist.')
                } else {
                    await ctx.reply('Error: ' + err.code)
                }
                return
            }
            let botIsAdmin = admins.filter(a => 
                    a.user &&
                    a.user.username === ctx.botInfo.username &&
                    a.can_post_messages).length
            if (!botIsAdmin) {
                ctx.reply('The bot has not been given necessary access: must be admin with Post messags permission.')
                return
            }
            await ctx.people.insert({username: args.u})
            let licenseExpiry = new Date(args.e)
            await ctx.channels.insert({
                username: args.c,
                admin: args.u,
                license_expiry: licenseExpiry.getTime()/1000, // by 1000 to convert to seconds
            })
            // set permissions for other admins
            await ctx.channels.updatePermissions(args.c, admins, ctx.botInfo.username)

            let startLink = `<a href="https://t.me/${ctx.botInfo.username}?start=${startParam}">Talk to @${ctx.botInfo.username} to start using it.</a>`
            let did = existingAdnin ? 'updated' : 'added'
            ctx.replyWithHTML(`Channel @${args.c} by @${args.u} ${did}, license expiring on ${licenseExpiry.toString()}. ` + startLink)

        } else {
            await ctx.reply('Necessary arguments not given: -u, -c, -e, -p, [-f]')
        }
    } else {
        await ctx.reply(ctx.fallbackReply)
    }
}

module.exports = {
    handleAdminAdd
}
