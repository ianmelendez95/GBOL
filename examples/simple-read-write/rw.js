// BEGIN RUNTIME

const fs = require('node:fs')
const { Buffer } = require('node:buffer')

const _READ_EOF = "READ-EOF"

// File Descriptors

function FileDescriptor(fileName) {
  this._fileName = fileName
  this._fd = undefined
  this._varSpec = undefined

  this._open = function (flags) {
    this._fd = fs.openSync(this._fileName, flags)
  }

  this._close = function () {
    fs.closeSync(this._fd)
  }

  this._read = function (atEnd) {
    try {
      this[this._varSpec.name] = _readVarSpec(this._fd, this._varSpec)
    } catch (e) {
      if (e.message === _READ_EOF) {
        atEnd()
      }
    }
  }

  this._write = function () {
    _writeVarSpec(this._fd, this._varSpec, this)
    fs.writeSync(this._fd, '\n')
  }

  this._loadVarSpec = function (varSpec) {
    this._varSpec = varSpec
    this[varSpec.name] = _valueFromVarSpec(varSpec)
  }
}

function _valueFromVarSpec(varSpec) {
  if (varSpec.type === 'string') {
    return varSpec.initialValue ? varSpec.initialValue : ''
  } else if (varSpec.type === 'binary-decimal') {
    return varSpec.initialValue ? varSpec.initialValue : 0
  } else if (varSpec.type === 'compound') {
    let obj = {}
    for (spec of varSpec.children) {
      obj[spec.name] = _valueFromVarSpec(spec)
    }
    return obj
  } else {
    throw new Error("Unrecognized var spec: " + varSpec.type)
  }
}

function _readVarSpec(fd, varSpec) {
  if (varSpec.type === 'string') {
    return _readText(fd, varSpec.length)
  } else if (varSpec.type === 'binary-decimal') {
    return _readPackedDecimal(fd, varSpec.length, varSpec.wholeDigits)
  } else if (varSpec.type === 'compound') {
    let obj = {}
    for (spec of varSpec.children) {
      obj[spec.name] = _readVarSpec(fd, spec)
    }
    return obj
  } else {
    throw new Error("Unrecognized var spec: " + varSpec.type)
  }
}

function _writeVarSpec(fd, varSpec, data) {
  if (varSpec.type === 'string') {
    _writeText(fd, varSpec.length, data.toString())
  } else if (varSpec.type === 'compound') {
    let obj = data[varSpec.name]
    for (spec of varSpec.children) {
      _writeVarSpec(fd, spec, obj[spec.name])
    }
  } else {
    throw new Error("Unrecognized var spec: " + varSpec.type)
  }
}

function _writeText(fd, length, text) {
  fs.writeSync(fd, _leftPad(length, text))
}

function _leftPad(len, str) {
  if (len <= str.length) {
    return str
  }

  return ' '.repeat(len - str.length) + str
}

// Read Text

function _readText(fd, length) {
  return _decodeEBCDICBuffer(_read(fd, length))
}

const EBCDIC_MAP = _buildEBCDICMap()

function _buildEBCDICMap() {
  const map = new Map()

  map.set(0x40, ' ')
  map.set(0x4B, '.')
  map.set(0x4E, '+')

  map.set(0x5B, '$')

  map.set(0x60, '-')
  map.set(0x6B, ',')
  map.set(0x6C, '%')
  map.set(0x6D, '_')

  map.set(0x7D, '\'')
  map.set(0x7E, '=')
  map.set(0x7F, '"')

  map.set(0x81, 'a')
  map.set(0x82, 'b')
  map.set(0x83, 'c')
  map.set(0x84, 'd')
  map.set(0x85, 'e')
  map.set(0x86, 'f')
  map.set(0x87, 'g')
  map.set(0x88, 'h')
  map.set(0x89, 'i')

  map.set(0x91, 'j')
  map.set(0x92, 'k')
  map.set(0x93, 'l')
  map.set(0x94, 'm')
  map.set(0x95, 'n')
  map.set(0x96, 'o')
  map.set(0x97, 'p')
  map.set(0x98, 'q')
  map.set(0x99, 'r')

  map.set(0xA1, '~')
  map.set(0xA2, 's')
  map.set(0xA3, 't')
  map.set(0xA4, 'u')
  map.set(0xA5, 'v')
  map.set(0xA6, 'w')
  map.set(0xA7, 'x')
  map.set(0xA8, 'y')
  map.set(0xA9, 'z')

  map.set(0xC0, '{')
  map.set(0xC1, 'A')
  map.set(0xC2, 'B')
  map.set(0xC3, 'C')
  map.set(0xC4, 'D')
  map.set(0xC5, 'E')
  map.set(0xC6, 'F')
  map.set(0xC7, 'G')
  map.set(0xC8, 'H')
  map.set(0xC9, 'I')

  map.set(0xD0, '}')
  map.set(0xD1, 'J')
  map.set(0xD2, 'K')
  map.set(0xD3, 'L')
  map.set(0xD4, 'M')
  map.set(0xD5, 'N')
  map.set(0xD6, 'O')
  map.set(0xD7, 'P')
  map.set(0xD8, 'Q')
  map.set(0xD9, 'R')

  map.set(0xE0, '\\')
  map.set(0xE2, 'S')
  map.set(0xE3, 'T')
  map.set(0xE4, 'U')
  map.set(0xE5, 'V')
  map.set(0xE6, 'W')
  map.set(0xE7, 'X')
  map.set(0xE8, 'Y')
  map.set(0xE9, 'Z')

  map.set(0xF0, '0')
  map.set(0xF1, '1')
  map.set(0xF2, '2')
  map.set(0xF3, '3')
  map.set(0xF4, '4')
  map.set(0xF5, '5')
  map.set(0xF6, '6')
  map.set(0xF7, '7')
  map.set(0xF8, '8')
  map.set(0xF9, '9')

  return map
}

function _decodeEBCDICBuffer(buffer) {
  return [...buffer].map(_decodeEBCDICByte).join("")
}

function _decodeEBCDICByte(byte) {
  const c = EBCDIC_MAP.get(byte)
  if (c == undefined) {
    console.error("Unable to decode byte: " + byte.toString(16))
    return '?'
  } else {
    return c
  }
}

// Read Packed Decimals

function _readPackedDecimal(fd, length, wholeDigits) {
  let ds = _decodePackedDecimalDigits(_read(fd, length))
  return _decimalFromPackedDigits(ds, wholeDigits)
}

// http://www.3480-3590-data-conversion.com/article-packed-fields.html
function _decimalFromPackedDigits(digits, wholeDigits) {
  let numDigitsLength = digits.length - 1  // last digit is actually the 'sign'

  if (wholeDigits > (digits.length - 1)) {
    throw new Error('Whole Part of packed decimal is longer than provided digits')
  } else if (wholeDigits == digits.length) {
    return parseInt(digits.join(''))
  }

  let wholePartStr = digits.slice(0, wholeDigits).join('')
  let decPartStr = digits.slice(wholeDigits, numDigitsLength).join('')
  let sign = wholeDigits == 0xD ? '-' : ''

  let numStr = sign + wholePartStr + '.' + decPartStr

  return parseFloat(numStr)
}

function _decodePackedDecimalDigits(packedNums) {
  let res = []
  for (let i = 0; i < packedNums.length; i++) {
    res.push(..._decodePackedDecimalDigitPair(packedNums[i]))
  }
  return res
}

function _decodePackedDecimalDigitPair(packedNum) {
  const first = packedNum >> 4
  const second = packedNum & 0x0F
  // console.log("Packed:", first, second)
  return [first, second]
}

/**
 * @returns Buffer containing the read content
 */
function _read(fd, length) {
  let b = Buffer.alloc(length)
  const bytesRead = fs.readSync(fd, b, 0, length)
  if (bytesRead === 0) {
    throw new Error("READ-EOF")
  } else if (bytesRead < length) {
    throw new Error("ERROR: Asked to read " + length + " bytes but only read " + bytesRead)
  }
  return b
}

// Program Executor

function _runProcedures(procedures) {
  for (proc of procedures) {
    let procRes = proc()

    if (procRes === 'GOBACK') {
      // console.log("TRACE asked to 'go back'")
      break;
    }
  }
}

// END RUNTIME
let printLine = new FileDescriptor(process.env["PRTLINE"])
let acctRec = new FileDescriptor(process.env["ACCTREC"])
printLine._loadVarSpec({
  children: [
    {
      length: 8,
      name: "acctNoO",
      type: "string",
    },
    {
      length: 13,
      name: "acctLimitO",
      type: "string",
    },
    {
      length: 13,
      name: "acctBalanceO",
      type: "string",
    },
    {
      length: 20,
      name: "lastNameO",
      type: "string",
    },
    {
      length: 15,
      name: "firstNameO",
      type: "string",
    },
    {
      length: 50,
      name: "commentsO",
      type: "string",
    },
  ],
  name: "printRec",
  type: "compound",
})
acctRec._loadVarSpec({
  children: [
    {
      length: 8,
      name: "acctNo",
      type: "string",
    },
    {
      length: 5,
      name: "acctLimit",
      type: "binary-decimal",
      wholeDigits: 7,
    },
    {
      length: 5,
      name: "acctBalance",
      type: "binary-decimal",
      wholeDigits: 7,
    },
    {
      length: 20,
      name: "lastName",
      type: "string",
    },
    {
      length: 15,
      name: "firstName",
      type: "string",
    },
    {
      children: [
        {
          length: 25,
          name: "streetAddr",
          type: "string",
        },
        {
          length: 20,
          name: "cityCounty",
          type: "string",
        },
        {
          length: 15,
          name: "usaState",
          type: "string",
        },
      ],
      name: "clientAddr",
      type: "compound",
    },
    {
      length: 7,
      name: "reserved",
      type: "string",
    },
    {
      length: 50,
      name: "comments",
      type: "string",
    },
  ],
  name: "acctFields",
  type: "compound",
})
let flags = _valueFromVarSpec({
  children: [
    {
      initialValue: " ",
      length: 1,
      name: "lastrec",
      type: "string",
    },
  ],
  name: "flags",
  type: "compound",
})
function openFiles() {
  acctRec._open("r")
  printLine._open("w")
}
function readNextRecord() {
  readRecord()
  while (!((flags.lastrec == "Y"))) {
    writeRecord()
    readRecord()
  }
}
function closeStop() {
  acctRec._close()
  printLine._close()
  return "GOBACK"
}
function readRecord() {
  acctRec._read(function () {
    flags.lastrec = "Y"
  })
}
function writeRecord() {
  printLine.printRec.acctNoO = acctRec.acctFields.acctNo
  printLine.printRec.acctLimitO = acctRec.acctFields.acctLimit
  printLine.printRec.acctBalanceO = acctRec.acctFields.acctBalance
  printLine.printRec.lastNameO = acctRec.acctFields.lastName
  printLine.printRec.firstNameO = acctRec.acctFields.firstName
  printLine.printRec.commentsO = acctRec.acctFields.comments
  printLine._write()
}
const __PROCEDURES__ = [
  openFiles,
  readNextRecord,
  closeStop,
  readRecord,
  writeRecord,
]
_runProcedures(__PROCEDURES__)