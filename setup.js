const { exec } = require('node:child_process')
const crypto = require('crypto')
const https = require('https')
const fs = require('fs')

let ADB = 'adb.exe '
let NAME = 'Nougat32'
let ENGINE = 'C:\\ProgramData\\BlueStacks_nxt\\'
let ENGINE_PATH = 'C:\\Program Files\\BlueStacks_nxt\\'

let BASE_URL = 'https://raw.githubusercontent.com/bluestacks-em/em/refs/heads/main'

let mDownloadStatus = 0

startServer()

async function startServer() {
    console.log('Node: Emulator Starting...')

    startDataDexDownload()

    let mId = await waitForStartEmulator(NAME, true, '127.0.0.1', 5555)

    if (mId) {
        console.log('Node: Device ID: '+mId)
        let connected = await waitForDeviceOnline(mId)

        if (connected) {
            console.log('Node: Connected Device: '+connected)
        }
    }

    process.exit(0)
}


async function waitForDeviceOnline(mId) {
    for (let i = 0; i < 120; i++) {
        try {
            let result = await cmdExecute(ADB+'devices')
            
            let deviceOnline = false
            result.split('\n').forEach(function(line) {
                try {
                    if (!line.startsWith('List of devices attached')) {
                        let split = line.split('\t')
                        if (split.length >= 2) {
                            if (split[0].trim() == mId && split[1].trim() == 'device') {
                                deviceOnline = true
                            }
                        }
                    }
                } catch (error) {}
            })

            if (deviceOnline) {
                break
            }
        } catch (error) {}

        await delay(1000)
    }

    for (let i = 0; i < 60; i++) {
        try {
            let result = await adbShell(mId, 'getprop ro.product.cpu.abi')
            if (result) {
                return result
            }
        } catch (error) {}

        await delay(1000)
    }

    return null
}

async function waitForStartEmulator(name, restart, host, port) {
    if (restart) {
        let isInstall = await isInstallEmulator()
        if (!isInstall) {
            await waitForInstallEmulator(name)
        }

        await cmdExecute('taskkill /IM "HD-Player.exe" /T /F')
        await delay(1000)
    
        try {
            let dixFile = '"'+ENGINE+'Engine\\'+name+'\\Data.vhdx"'
            let bluestacks = fs.readFileSync('config.conf', 'utf-8')
            // let replaceAdId = await randomAdId(bluestacks)
            fs.writeFileSync('bluestacks.conf', bluestacks)
            await cmdExecute('attrib -r "'+ENGINE+'bluestacks.conf"')
            await cmdExecute('copy bluestacks.conf  "'+ENGINE+'bluestacks.conf"')
            await cmdExecute('attrib +r "'+ENGINE+'bluestacks.conf"')
            await cmdExecute('rm -f '+dixFile)
            if (await waitForDownloadCompleted()) {
                await cmdExecute('copy Data.vhdx '+dixFile)
            }
        } catch (error) {}
    
        await delay(2000)
        cmdExecute('"'+ENGINE_PATH+'HD-Player.exe" --instance '+name)
        
        console.log('Node: Emulator Runing...')
    }

    for (let i = 0; i < 120; i++) {
        try {
            let result = await cmdExecute(ADB+'connect '+host+':'+port)
            if (result && (result.indexOf('connected to '+host+':'+port) > -1)) {
                return host+':'+port
            }
        } catch (error) {}

        await delay(1000)
    }
}

async function waitForInstallEmulator(name) {
    cmdExecute('Emulator.exe --defaultImageName '+name+' --imageToLaunch '+name)

    await waitForTaskRuning('BlueStacksInstaller.exe', 30)
    console.log('Node: Open BlueStacks Installer')
    
    await cmdExecute('python install.py')
    
    console.log('Node: BlueStacks Installing')

    await waitForDeskTopShorcut()

    console.log('Node: BlueStacks Install Success')

    await waitForDownloadCompleted()

    await delay(1000)
    await cmdExecute('taskkill /IM "BlueStacksInstaller.exe" /T /F')
    await delay(2000)
}

async function waitForDeskTopShorcut() {
    for (let i = 0; i < 120; i++) {
        if (await isInstallEmulator()) {
            return true
        }
        await delay(2000)
    }

    return false
}

async function isInstallEmulator() {
    try {
        let list = fs.readdirSync('C:\\Users\\Public\\Desktop')
        let isInstall = false

        for (let i = 0; i < list.length; i++) {
            if (list[i] == 'BlueStacks 5.lnk') {
                isInstall = true
                break
            }
        }
        
        if (isInstall) {
            return true
        }
    } catch (error) {}

    return false
}

async function waitForInstalCompleted() {
    let folders = [
        ENGINE+'temp\\',
        ENGINE+'.backup\\',
    ]

    for (let i = 0; i < 10; i++) {
        let allRemoved = folders.every(folder => !fs.existsSync(folder))

        if (allRemoved) {
            return true
        }

        await delay(1000)
    }

    return false
}

async function downloadPart(part, writeStream) {
    return new Promise((resolve, reject) => {
        let fileName = `data${String(part).padStart(2, "0")}.bin`
        let url = `${BASE_URL}/${fileName}`;

        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`${fileName} download failed: HTTP ${res.statusCode}`))
                return
            }

            res.pipe(writeStream, { end: false })

            res.on("end", () => {
                resolve()
            })

            res.on("error", reject)
        }).on("error", reject)
    })
}

async function startDataDexDownload() {
    if (fs.existsSync('Data.vhdx')) {
        mDownloadStatus = 1
        return
    }

    mDownloadStatus = 0

    let writeStream = fs.createWriteStream('Data.vhdx')

    try {
        for (let i = 1; i <= 23; i++) {
            await downloadPart(i, writeStream)
        }

        writeStream.end()

        writeStream.on("finish", () => {
            mDownloadStatus = 1
        })
    } catch (err) {
        writeStream.destroy()
        mDownloadStatus = 2
    }
}

async function waitForDownloadCompleted() {
    
    for (let i = 0; i < 120; i++) {
        if (mDownloadStatus == 1) {
            return true
        } else if (mDownloadStatus == 2) {
            return false
        }
        await delay(1000)
    }

    return false
}

async function replaceConfig(configJson) {
    let details = await getRandomDevices()

    configJson = configJson.replace('UUUUUUUUUU', details.brand).replace('UUUUUUUUUU', details.brand).replace('VVVVVVVVVV', details.model)

    configJson = configJson.replace('WWWWWWWWWW', details.miit).replace('XXXXXXXXXX', details.code)

    return configJson.replace('YYYYYYYYYY', getRandomIMEI()).replace('ZZZZZZZZZZ', crypto.randomUUID())
}

function generateIMEI() {
    let rbi = [
        "01", "10", "30", "33", "35",
        "44", "45", "49", "50", "51",
        "52", "53", "54", "86", "91",
        "98", "99"
    ]

    let imei = rbi[Math.floor(Math.random() * rbi.length)]

    while (imei.length < 14) {
        imei += Math.floor(Math.random() * 10)
    }

    return imei
}

function checkSum(imei) {
    let sum = 0

    for (let i = 0; i < imei.length; i++) {
        let n = Number(imei[i])

        if (i % 2 === 1) {
            n *= 2
            if (n > 9) n -= 9
        }

        sum += n
    }

    return String((10 - (sum % 10)) % 10)
}

function getRandomIMEI() {
    let imei14 = generateIMEI()
    return imei14 + checkSum(imei14)
}

async function getRandomDevices() {
    let data = JSON.parse(fs.readFileSync('devices.json', 'utf8'))
    
    let brands = [...Object.keys(data)]

    brands.push('Samsung')
    brands.push('Samsung')

    let brand = brands[Math.floor(Math.random() * brands.length)]

    let devices = data[brand]
    let device = devices[Math.floor(Math.random() * devices.length)]

    return { brand, ...device }
}

async function waitForTaskRuning(taskName, timeout = 30) {
    for (let i = 0; i < timeout; i++) {
        try {
            let result = await cmdExecute('tasklist')
            if (result.toLowerCase().indexOf(taskName.toLowerCase()) > -1) {
                break
            }
        } catch (error) {}

        await delay(1000)
    }
}

async function cmdExecute(cmd) {
    return new Promise((resolve) => {
        try {
            exec(cmd, function (err, stdout, stderr) {
                try {
                    if (err) {
                        resolve(null)
                    } else {
                        resolve(stdout.trim())
                    }
                } catch (error) {
                    resolve(null)
                }
            })
        } catch (error) {
            resolve(null)
        }
    })
}

async function adbShell(mId, cmd) {
    try {
        return await cmdExecute(ADB+'-s '+mId+' shell '+cmd)
    } catch (error) {}

    return null
}

function getRandomNumber(size) {
    let N = ['0','1','2','3','4','5','6','7','8','9']
    
    let num = ''

    for (let i = 0; i < size; i++) {
        num += N[Math.floor((Math.random() * N.length))]
    }

    return num
}

function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    })
}