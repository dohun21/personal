// app/schedule.tsx
import { auth } from "@/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";

type Day = 0|1|2|3|4|5|6; // 0=일
type Range = { start: string; end: string }; // "HH:mm"
type TimePref = { mode: "exclude" | "available"; byDay: Record<Day, Range[]> };

const COLOR = {
  text: "#0F172A", muted: "#6B7280", border: "#E5E7EB",
  card: "#FFFFFF", bg: "#FFFFFF", primary: "#2563EB", danger:"#EF4444",
};

const keyWithUid = (base: string, uid?: string|null) => (uid ? `${base}_${uid}` : base);
const EX_KEY = "studyExcludedRangesV1";
const AV_KEY = "studyAvailableRangesV1";
const DAYS_LABEL = ["일","월","화","수","목","금","토"] as const;

function hhmmToMin(hhmm: string){ const [h,m]=hhmm.split(":").map(Number); return h*60+m; }
function minToHHMM(min:number){ const h=Math.floor(min/60), m=min%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function isValidRange(r:Range){ return hhmmToMin(r.end)>hhmmToMin(r.start); }
function mergeRanges(ranges: Range[]): Range[] {
  const arr = [...ranges].sort((a,b)=>hhmmToMin(a.start)-hhmmToMin(b.start));
  const out: Range[] = [];
  for(const r of arr){
    if(!isValidRange(r)) continue;
    if(!out.length){ out.push({...r}); continue; }
    const last = out[out.length-1];
    if(hhmmToMin(r.start) <= hhmmToMin(last.end)){
      if(hhmmToMin(r.end) > hhmmToMin(last.end)) last.end = r.end;
    } else out.push({...r});
  }
  return out;
}

export default function SchedulePage() {
  const router = useRouter();
  const [uid, setUid] = useState<string|null>(null);
  useEffect(()=> {
    const unsub = onAuthStateChanged(auth, u=>setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  const emptyByDay = useMemo(()=>({0:[],1:[],2:[],3:[],4:[],5:[],6:[]} as Record<Day,Range[]>),[]);
  const [mode, setMode] = useState<"exclude"|"available">("exclude");
  const [byDay, setByDay] = useState<Record<Day,Range[]>>(emptyByDay);
  const [day, setDay] = useState<Day>(1); // 기본 월요일

  const HOURS = useMemo(()=>Array.from({length:24},(_,i)=>i),[]);
  const MINS  = useMemo(()=>Array.from({length:12},(_,i)=>i*5),[]);
  const [startH, setStartH] = useState(8);
  const [startM, setStartM] = useState(30);
  const [endH, setEndH] = useState(15);
  const [endM, setEndM] = useState(30);

  // 저장값 불러오기 (있으면 이어쓰기)
  useEffect(()=>{
    (async()=>{
      const [exRaw, avRaw, exRawU, avRawU] = await Promise.all([
        AsyncStorage.getItem(EX_KEY),
        AsyncStorage.getItem(AV_KEY),
        uid ? AsyncStorage.getItem(keyWithUid(EX_KEY, uid)) : Promise.resolve(null),
        uid ? AsyncStorage.getItem(keyWithUid(AV_KEY, uid)) : Promise.resolve(null),
      ]);
      const ex = exRawU ?? exRaw;
      const av = avRawU ?? avRaw;
      if(ex){
        const parsed: TimePref = JSON.parse(ex);
        setMode("exclude");
        setByDay(parsed.byDay ?? emptyByDay);
      } else if(av){
        const parsed: TimePref = JSON.parse(av);
        setMode("available");
        setByDay(parsed.byDay ?? emptyByDay);
      }
    })();
  },[uid]);

  const addRange = () => {
    const r: Range = { start: minToHHMM(startH*60+startM), end: minToHHMM(endH*60+endM) };
    if(!isValidRange(r)){
      Alert.alert("시간 확인","끝 시간이 시작 시간보다 커야 해요.");
      return;
    }
    setByDay(prev=>{
      const merged = mergeRanges([...(prev[day]||[]), r]);
      return { ...prev, [day]: merged };
    });
  };

  const removeRange = (idx:number) => {
    setByDay(prev=>{
      const list = [...(prev[day]||[])];
      list.splice(idx,1);
      return { ...prev, [day]: list };
    });
  };

  const save = async ()=>{
    const payload: TimePref = { mode, byDay };
    if(mode==="exclude"){
      await AsyncStorage.setItem(EX_KEY, JSON.stringify(payload));
      await AsyncStorage.removeItem(AV_KEY);
      if(uid){
        await AsyncStorage.setItem(keyWithUid(EX_KEY, uid), JSON.stringify(payload));
        await AsyncStorage.removeItem(keyWithUid(AV_KEY, uid));
      }
    } else {
      await AsyncStorage.setItem(AV_KEY, JSON.stringify(payload));
      await AsyncStorage.removeItem(EX_KEY);
      if(uid){
        await AsyncStorage.setItem(keyWithUid(AV_KEY, uid), JSON.stringify(payload));
        await AsyncStorage.removeItem(keyWithUid(EX_KEY, uid));
      }
    }
    router.replace("/"); // 저장 후 목록으로
  };

  const summaryForDay = (d: Day)=>{
    const total = (byDay[d]||[]).reduce((acc,r)=> acc + (hhmmToMin(r.end)-hhmmToMin(r.start)), 0);
    const h = Math.floor(total/60), m = total%60;
    const label = mode==="exclude" ? "제외" : "가능";
    return `${label} 합계: ${h>0?`${h}시간 `:""}${m}분`;
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>공부 시간대 설정</Text>
      <Text style={styles.caption}>
        {mode==="exclude" ? "학교·식사 등 제외할 시간을 넣어주세요. 나머지는 가능 시간으로 간주됩니다."
                          : "공부 가능한 시간만 넣어주세요. 나머지는 제외됩니다."}
      </Text>

      {/* 모드 토글 */}
      <View style={styles.toggleWrap}>
        <TouchableOpacity
          style={[styles.toggleBtn, mode==="exclude" && styles.toggleOn]}
          onPress={()=>setMode("exclude")} activeOpacity={0.9}
        >
          <Text style={[styles.toggleTxt, mode==="exclude" && styles.toggleTxtOn]}>제외 시간 지정</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, mode==="available" && styles.toggleOn]}
          onPress={()=>setMode("available")} activeOpacity={0.9}
        >
          <Text style={[styles.toggleTxt, mode==="available" && styles.toggleTxtOn]}>가능 시간 지정</Text>
        </TouchableOpacity>
      </View>

      {/* 요일 선택 */}
      <View style={styles.daysRow}>
        {DAYS_LABEL.map((lbl, i)=>(
          <TouchableOpacity
            key={lbl}
            style={[styles.dayChip, day===i && styles.dayChipOn]}
            onPress={()=>setDay(i as Day)}
          >
            <Text style={[styles.dayChipTxt, day===i && styles.dayChipTxtOn]}>{lbl}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.subtle}>{summaryForDay(day)}</Text>

      {/* 시간대 추가 */}
      <View style={styles.card}>
        <Text style={styles.section}>시간대 추가</Text>
        <View style={styles.pickerRow}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>시작(시)</Text>
            <Picker selectedValue={startH} onValueChange={(v)=>setStartH(v as number)} style={styles.picker}>
              {HOURS.map(h=><Picker.Item key={`sh${h}`} label={`${h}`} value={h} />)}
            </Picker>
          </View>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>시작(분)</Text>
            <Picker selectedValue={startM} onValueChange={(v)=>setStartM(v as number)} style={styles.picker}>
              {MINS.map(m=><Picker.Item key={`sm${m}`} label={`${m}`} value={m} />)}
            </Picker>
          </View>

          <Text style={styles.colon}>~</Text>

          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>끝(시)</Text>
            <Picker selectedValue={endH} onValueChange={(v)=>setEndH(v as number)} style={styles.picker}>
              {HOURS.map(h=><Picker.Item key={`eh${h}`} label={`${h}`} value={h} />)}
            </Picker>
          </View>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerLabel}>끝(분)</Text>
            <Picker selectedValue={endM} onValueChange={(v)=>setEndM(v as number)} style={styles.picker}>
              {MINS.map(m=><Picker.Item key={`em${m}`} label={`${m}`} value={m} />)}
            </Picker>
          </View>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={addRange} activeOpacity={0.9}>
          <Text style={styles.addTxt}>시간대 추가</Text>
        </TouchableOpacity>

        {/* 프리셋 */}
        <View style={{ marginTop: 8, gap: 8 }}>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={()=>{ setStartH(8); setStartM(30); setEndH(15); setEndM(30); setTimeout(addRange,0); }}
          >
            <Text style={styles.presetTxt}>평일 학교 08:30~15:30 추가</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={()=>{ setStartH(12); setStartM(30); setEndH(13); setEndM(30); setTimeout(addRange,0); }}
          >
            <Text style={styles.presetTxt}>점심 12:30~13:30 추가</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={()=>{ setStartH(18); setStartM(0); setEndH(19); setEndM(0); setTimeout(addRange,0); }}
          >
            <Text style={styles.presetTxt}>저녁 18:00~19:00 추가</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 등록된 구간 */}
      <View style={styles.card}>
        <Text style={styles.section}>{DAYS_LABEL[day]}요일 {mode==="exclude" ? "제외" : "가능"} 시간대</Text>
        {(byDay[day]||[]).length===0 ? (
          <Text style={styles.empty}>아직 추가된 구간이 없어요.</Text>
        ) : (
          (byDay[day]||[]).map((r,idx)=>(
            <View key={`${r.start}-${r.end}-${idx}`} style={styles.rangeRow}>
              <Text style={styles.rangeTxt}>{r.start} ~ {r.end}</Text>
              <TouchableOpacity onPress={()=>removeRange(idx)} style={styles.delBtn}>
                <Text style={styles.delTxt}>삭제</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* 저장 → /list */}
      <TouchableOpacity style={styles.saveBtn} onPress={save} activeOpacity={0.9}>
        <Text style={styles.saveTxt}>저장하고 목록으로</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:COLOR.bg, padding:16 },
  title:{ fontSize:22, fontWeight:"800", color:COLOR.text },
  caption:{ color:COLOR.muted, marginTop:6, marginBottom:10 },

  toggleWrap:{ flexDirection:"row", gap:8, marginTop:8, marginBottom:12 },
  toggleBtn:{ flex:1, borderWidth:1, borderColor:COLOR.border, backgroundColor:COLOR.card,
    borderRadius:12, paddingVertical:12, alignItems:"center" },
  toggleOn:{ borderColor:COLOR.primary, backgroundColor:"#EFF6FF" },
  toggleTxt:{ fontWeight:"700", color:COLOR.text },
  toggleTxtOn:{ color:COLOR.primary },

  daysRow:{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 },
  dayChip:{ flex:1, marginHorizontal:3, borderWidth:1, borderColor:COLOR.border, borderRadius:10,
    paddingVertical:8, alignItems:"center", backgroundColor:COLOR.card },
  dayChipOn:{ borderColor:COLOR.primary, backgroundColor:"#EEF2FF" },
  dayChipTxt:{ color:COLOR.text, fontWeight:"700" },
  dayChipTxtOn:{ color:COLOR.primary, fontWeight:"900" },

  subtle:{ color: COLOR.muted, marginBottom: 6 }, // ✅ 누락되었던 스타일 추가

  card:{ borderWidth:1, borderColor:COLOR.border, backgroundColor:COLOR.card, borderRadius:14, padding:12, marginTop:10,
    ...Platform.select({ ios:{shadowColor:"#000",shadowOpacity:0.06,shadowRadius:8,shadowOffset:{width:0,height:3}}, android:{elevation:2} })
  },
  section:{ fontSize:15, fontWeight:"800", color:COLOR.text, marginBottom:8 },

  pickerRow:{ flexDirection:"row", gap:8, alignItems:"center" },
  pickerBox:{ flex:1, borderWidth:1, borderColor:COLOR.border, borderRadius:12, overflow:"hidden", backgroundColor:"#fff" },
  picker:{ height:140 },
  pickerLabel:{ fontSize:12, color:COLOR.muted, paddingHorizontal:10, paddingTop:8 },
  colon:{ width:20, textAlign:"center", color:COLOR.muted },

  addBtn:{ marginTop:10, backgroundColor:COLOR.primary, borderRadius:12, paddingVertical:12, alignItems:"center" },
  addTxt:{ color:"#fff", fontWeight:"900" },

  rangeRow:{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", paddingVertical:10, borderBottomWidth:1, borderBottomColor:COLOR.border },
  rangeTxt:{ fontSize:15, color:COLOR.text },
  delBtn:{ paddingVertical:6, paddingHorizontal:10, borderRadius:8, backgroundColor:"#F3F4F6" },
  delTxt:{ color:COLOR.danger, fontWeight:"800" },

  empty:{ color:COLOR.muted },

  presetBtn:{ borderWidth:1, borderColor:COLOR.border, borderRadius:10, paddingVertical:10, paddingHorizontal:12, backgroundColor:"#F9FAFB" },
  presetTxt:{ color:COLOR.text, fontWeight:"700" },

  saveBtn:{ backgroundColor:COLOR.primary, borderRadius:12, paddingVertical:14, marginTop:16 },
  saveTxt:{ color:"#fff", textAlign:"center", fontWeight:"900", fontSize:16 },
});
