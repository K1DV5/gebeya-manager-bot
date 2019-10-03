const Jimp = require('jimp')

function watermarkProps(width, height, proportion=0.2) {
    let watermarkPos = 1 - proportion
    return {
        x: width * watermarkPos - 40,
        y: height * watermarkPos - 40,
        w: width * proportion,
        h: height * proportion
    }
}

// width and height arrangements
function arrange(total, width) {
    if (total === 1) {
        let height = width
        return {
            width,
            height,
            arrangement: [{x: 0, y: 0, w: width, h: height}],
            watermark: watermarkProps(width, height)
        }
    }
    let gap = 10 // gap between images
    if (total === 2) {
        let height = width * 5/4
        let singleHeight = (height - gap)/2
        return {
            width,
            height,
            arrangement: [
                {x: 0, y: 0, w: width, h: singleHeight},
                {x: 0, y: singleHeight + gap, w: width, h: singleHeight}
            ],
            watermark: watermarkProps(width, height)
        }
    }
    let singleWidth = (width - gap)/2
    let singleHeight = singleWidth
    let rem = total % 2
    let height = (singleHeight + gap) * (total + rem) / 2 - gap
    arrangement = []
    let currentLine = 0
    if (rem) {
        arrangement.push({x: 0, y: 0, w: width, h: singleHeight})
        currentLine += singleHeight + gap
        total--
    }
    for (let i = 0; i < total/2; i++) {
        arrangement.push({x: 0, y: currentLine, w: singleWidth, h: singleHeight})
        arrangement.push({x: singleWidth + gap, y: currentLine, w: singleWidth, h: singleHeight})
        currentLine += singleHeight + gap
    }
    return { width, height, arrangement, watermark: watermarkProps(width, height) }
}

async function makeCollage(sources, dest, watermark=undefined, width=1024) {
    let collageProps = arrange(sources.length, width)
    let collage = await (new Jimp(collageProps.width, collageProps.height))
    for (let [index, file] of sources.entries()) {
        let props = collageProps.arrangement[index]
        let image = await Jimp.read(file)
        await image.cover(props.w, props.h)
        collage.composite(image, props.x, props.y)
    }
    if (watermark) {
        let watermarkImg = await Jimp.read(watermark)
        let watermarkProp = collageProps.watermark
        await watermarkImg.contain(watermarkProp.w, watermarkProp.h, Jimp.HORIZONTAL_ALIGN_RIGHT | Jimp.VERTICAL_ALIGN_BOTTOM)
        await collage.composite(watermarkImg, watermarkProp.x, watermarkProp.y)
    }
    collage.write(dest)
}

module.exports = makeCollage
