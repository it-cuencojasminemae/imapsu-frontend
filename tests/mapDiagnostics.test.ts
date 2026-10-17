import test from 'node:test'
import assert from 'node:assert/strict'
import { mapBindingDiagnostics } from '../app/utils/mapDiagnostics.ts'
test('map diagnostics report ambiguities without changing property associations', () => {
  const properties=[{building:'Unknown'},{building:'Duplicate'}]
  const directory=[{order:19,name:'Duplicate'},{order:50,name:'Duplicate'},{order:59,name:'Missing'}]
  const result=mapBindingDiagnostics(properties,directory,[19,50,34],name=>name==='Duplicate'?directory[0]!:null)
  assert.deepEqual(result,{unresolved:['Unknown'],ambiguous:['Duplicate'],directoryOnly:[59],modelOnly:[34]})
  assert.deepEqual(properties,[{building:'Unknown'},{building:'Duplicate'}])
})
