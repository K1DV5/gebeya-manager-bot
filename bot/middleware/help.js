function help(ctx) {
    let helpText = '/post to post a new item to your channel\n/settings to change your channel\'s logo etc.'
    ctx.reply(helpText)
}

module.exports = help
