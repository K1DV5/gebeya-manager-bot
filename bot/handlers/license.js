
async function handleLicense(ctx) {
    if (ctx.state.isChannelAdmin) {
        let username = ctx.from.username
        let channels = await ctx.people.getChannels(username)
        if (!channels) {
            ctx.reply('You have no channels, contact @' + ctx.admins[0] + ' to add a channel.')
            return
        }
        let response = 'You have registered the following channels. Their license expiry date is shown accordingly.\n'
        for (let channel of channels) {
            let expDate = new Date(channel.license_expiry*1000)
            expDate = expDate.getTime() > ctx.update.message.date*1000 ? expDate.toDateString() : '[Expired]'
            response += '\n@' + channel.username + ' - ' + expDate
        }
        ctx.reply(response)
    } else {
        ctx.reply(ctx.state.fallbackReply)
    }
}

module.exports = {
    handleLicense
}
