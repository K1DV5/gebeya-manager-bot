
async function handleLicense(ctx) {
    if (ctx.state.isChannelAdmin) {
        let username = ctx.from.username
        let channels = await ctx.people.getChannels(username)
        let permittedChannels = await ctx.people.getChannels(username, undefined, 'permitted')
        if (!(channels || permittedChannels)) {
            ctx.reply('You have no channels, contact @' + ctx.admins[0] + ' to register a channel.')
            return
        }
        let response = ''
        if (channels) {
            response += 'You have registered the following channels. Their license expiry date is shown accordingly.\n'
            for (let channel of channels) {
                let expDate = new Date(channel.license_expiry*1000)
                expDate = expDate.getTime() > ctx.update.message.date*1000 ? expDate.toDateString() : '[Expired]'
                response += '\n@' + channel.username + ' - ' + expDate
            }
        }
        if (permittedChannels) {
            response += '\n\nThe following are the channels you have permissions on. Their license expiry date is shown accordingly.\n'
            for (let channel of permittedChannels) {
                let expDate = new Date(channel.license_expiry*1000)
                expDate = expDate.getTime() > ctx.update.message.date*1000 ? expDate.toDateString() : '[Expired]'
                response += '\n@' + channel.username + ' - ' + expDate
            }
        }
        ctx.reply(response.trim())
    } else {
        ctx.reply(ctx.state.fallbackReply)
    }
}

module.exports = {
    handleLicense
}
