import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTenYearAverage, retainTenYearAverage, withTenYearAverage } from '../scripts/ten-year-flow.mjs';
import { validateComparison } from '../scripts/validate-comparison.mjs';
import { weeklyFlow } from '../scripts/trend-series.mjs';
const site='02085500', now=new Date('2026-10-12T14:00:00Z');
function sample() {
  const rows=[];
  for(let year=2016;year<=2025;year++) {
    rows.push({value:String(year-2015),dateTime:year+'-01-01T00:00:00',qualifiers:[year===2025?'P':'A']});
    if([2016,2020,2024].includes(year)) rows.push({value:'6',dateTime:year+'-02-29T00:00:00',qualifiers:['A']});
  }
  rows.push({value:'0',dateTime:'2016-01-02T00:00:00',qualifiers:['A']});
  return {value:{timeSeries:[{name:'USGS:'+site+':00060:00003',sourceInfo:{siteCode:[{value:site}]},variable:{variableCode:[{value:'00060'}],unit:{unitCode:'ft3/s'},noDataValue:-999999},values:[{value:rows}]}]}};
}
function comparison(average) {
  return {schemaVersion:1,year:2026,stations:Object.fromEntries([['flat',site],['little','0208521324']].map(([key,id])=>[key,{site:id,status:'fresh',sourceUrl:'https://waterdata.usgs.gov/monitoring-location/'+id+'/',historicalPeriod:'1990–2025',days:[{date:'2026-01-01',currentYear:1,historicalMean:20,historicalSampleYears:35}],...(key==='flat'?{tenYearAverage:average}:{})}]))};
}

test('ten-year mean uses ten completed calendar years, available observations and leap-day sample counts',()=>{
  const average=parseTenYearAverage(sample(),site,2026,now);
  assert.equal(average.startYear,2016);assert.equal(average.endYear,2025);
  const jan=average.days.find(d=>d.monthDay==='01-01'), leap=average.days.find(d=>d.monthDay==='02-29');
  assert.equal(jan.value,5.5);assert.equal(jan.count,10);assert.equal(jan.provisionalCount,1);
  assert.equal(leap.value,6);assert.equal(leap.count,3);assert.equal(leap.expectedCount,3);
  assert.equal(average.days.find(d=>d.monthDay==='01-02').value,0);
  assert.equal(average.days.find(d=>d.monthDay==='01-02').count,1);
  assert.equal(average.days.find(d=>d.monthDay==='01-03').value,null);
  assert.doesNotThrow(()=>validateComparison(comparison(average)));
  const mapped=withTenYearAverage([],average,2026);
  assert.equal(mapped.length,365);assert.equal(mapped.some(d=>d.date==='2026-02-29'),false);
  assert.equal(withTenYearAverage([],average,2028).length,366);
});

test('wrong station/units, current-year data, duplicate dates and invalid values cannot become a ten-year baseline',()=>{
  for(const alter of [
    d=>d.value.timeSeries[0].variable.unit.unitCode='m3/s',
    d=>d.value.timeSeries[0].sourceInfo.siteCode[0].value='wrong',
    d=>d.value.timeSeries[0].values[0].value.push({value:'1',dateTime:'2026-01-01'}),
    d=>d.value.timeSeries[0].values[0].value.push({...d.value.timeSeries[0].values[0].value[0]}),
    d=>d.value.timeSeries[0].values[0].value[0].value='-1',
  ]) {const d=sample();alter(d);assert.throws(()=>parseTenYearAverage(d,site,2026,now));}
  const d=sample();d.value.timeSeries[0].values[0].value.at(-1).value='-999999';
  assert.equal(parseTenYearAverage(d,site,2026,now).days.find(d=>d.monthDay==='01-02').value,null);
  const average=parseTenYearAverage(sample(),site,2026,now);average.endYear=2026;
  assert.throws(()=>validateComparison(comparison(average)));
});

test('failed refresh retains its actual decade rather than relabeling it at year rollover',()=>{
  const average=parseTenYearAverage(sample(),site,2026,now);
  const retained=retainTenYearAverage(average,site,2027,new Date('2027-01-01T11:00:00Z'),'source failed');
  assert.equal(retained.status,'stale');assert.equal(retained.startYear,2016);assert.equal(retained.endYear,2025);
  assert.deepEqual(retained.days,average.days);
  const data=comparison(retained);data.year=2027;
  for(const station of Object.values(data.stations)) station.days[0].date='2027-01-01';
  assert.doesNotThrow(()=>validateComparison(data));
  retained.status='fresh';assert.throws(()=>validateComparison(data));
});

test('weekly ten-year comparisons use the same observed dates; missing averages remain gaps',()=>{
  const rows=[
    {date:'2026-01-01',currentYear:10,historicalMean:30,tenYearMean:20,tenYearCount:10},
    {date:'2026-01-02',currentYear:null,historicalMean:60,tenYearMean:100,tenYearCount:9},
    {date:'2026-01-03',currentYear:30,historicalMean:90,tenYearMean:40,tenYearCount:10},
  ];
  const [week]=weeklyFlow(rows,{start:'2026-01-01',end:'2026-01-03'},'2026-01-03');
  assert.equal(week.current,20);assert.equal(week.pairedTenYear,30);
  assert.equal(week.tenYear,160/3);assert.equal(week.tenYearCountLow,9);assert.equal(week.tenYearCountHigh,10);
  rows[1].tenYearMean=null;
  assert.equal(weeklyFlow(rows,{start:'2026-01-01',end:'2026-01-03'},'2026-01-03')[0].tenYear,null);
});
