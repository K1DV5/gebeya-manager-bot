
async function handleCancel(ctx) {
    let username = ctx.from.username
    let convo = await ctx.people.getConvo(username)
    if (currently) {
        let about = currently.split('.', 1)[0]
        ctx.people.clearDraft(username)
        ctx.reply(about[0].toUpperCase() + about.slice(1) + ' cancelled.')
    } else {
        ctx.reply('You aren\'t doing anything.')
    }
}

module.exports = {handleCancel}
