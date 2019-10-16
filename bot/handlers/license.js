
async function handleLicense(ctx) {
    if (ctx.state.isAdmin) {
        let username = ctx.from.username
        let query = 'SELECT c.username, c.license_expiry FROM people AS p INNER JOIN channels AS c ON p.username = c.admin WHERE p.username = ?'
        let channelsInfo = await ctx.state.sql(query, [username])
        let response = 'You have registered the following channels. Their license expiry date is shown accordingly.\n'
        for (let channel of channelsInfo) {
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
