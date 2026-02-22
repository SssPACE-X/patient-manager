'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type AllocationType = 'unassigned' | 'mon-wed' | 'tue-thu' | 'early' | 'discharge';

type TreatmentStatus = 'none' | 'done' | 'missed';

interface Patient {
  id: string;
  name: string;
  regNumber: string;
  allocation: AllocationType;
  createdAt: Date;
  dischargedAt?: Date;
  memo?: string;
  treatmentDailyStatus?: TreatmentStatus;
  treatmentUpdatedAt?: Date;
}

export default function Home() {
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);

  // Form State
  const [newName, setNewName] = useState('');
  const [newRegNum, setNewRegNum] = useState('');

  // Edit State
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRegNum, setEditRegNum] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const startEditing = (patient: Patient) => {
    setEditingPatientId(patient.id);
    setEditName(patient.name);
    setEditRegNum(patient.regNumber);
  };

  const saveEdit = async (patientId: string) => {
    const finalName = editName.trim();
    const finalRegNum = editRegNum.trim();

    // Optimistic update
    const patientToUpdate = patients.find(p => p.id === patientId);
    if (!patientToUpdate) return;

    const newName = finalName || patientToUpdate.name;
    const newRegNum = finalRegNum || patientToUpdate.regNumber;

    setPatients(patients.map(p => {
      if (p.id !== patientId) return p;
      return { ...p, name: newName, regNumber: newRegNum };
    }));
    setEditingPatientId(null);

    // DB Update
    await supabase.from('patients').update({
      name: newName,
      reg_number: newRegNum
    }).eq('id', patientId);
  };

  const deletePatient = async (patientId: string) => {
    if (confirm('이 환자 기록을 완전히 삭제하시겠습니까?')) {
      setPatients(patients.filter(p => p.id !== patientId));
      await supabase.from('patients').delete().eq('id', patientId);
    }
  };

  const handleMemoBlur = async (patientId: string, memo: string) => {
    await supabase.from('patients').update({ memo }).eq('id', patientId);
  };

  // Initial Fetch & Realtime Subscription
  useEffect(() => {
    const initPush = async () => {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          try {
            const registration = await navigator.serviceWorker.ready;

            // Convert VAPID public key
            const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!publicVapidKey) return;

            const base64UrlToUint8Array = (base64UrlData: string) => {
              const padding = '='.repeat((4 - base64UrlData.length % 4) % 4);
              const base64 = (base64UrlData + padding).replace(/\-/g, '+').replace(/_/g, '/');
              const rawData = window.atob(base64);
              const outputArray = new Uint8Array(rawData.length);
              for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
              }
              return outputArray;
            };

            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToUint8Array(publicVapidKey)
              });

              await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription)
              });
            }
          } catch (error) {
            console.error('Push error:', error);
          }
        }
      }
    };
    initPush();

    const fetchPatients = async () => {
      const { data } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setPatients(data.map(p => ({
          id: p.id,
          name: p.name,
          regNumber: p.reg_number,
          allocation: p.allocation as AllocationType,
          createdAt: new Date(p.created_at),
          dischargedAt: p.discharged_at ? new Date(p.discharged_at) : undefined,
          memo: p.memo || undefined,
          treatmentDailyStatus: p.treatment_daily_status as TreatmentStatus,
          treatmentUpdatedAt: p.treatment_updated_at ? new Date(p.treatment_updated_at) : undefined,
        })));
      }
    };

    fetchPatients();

    const channel = supabase
      .channel('public:patients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const p = payload.new;
          setPatients(prev => {
            if (prev.find(existing => existing.id === p.id)) return prev;

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('신규 환자 등록', { body: `새로운 환자 ${p.name}님이 등록되었습니다.` });
            }

            return [{
              id: p.id,
              name: p.name,
              regNumber: p.reg_number,
              allocation: p.allocation,
              createdAt: new Date(p.created_at),
              dischargedAt: p.discharged_at ? new Date(p.discharged_at) : undefined,
              memo: p.memo || undefined,
              treatmentDailyStatus: p.treatment_daily_status,
              treatmentUpdatedAt: p.treatment_updated_at ? new Date(p.treatment_updated_at) : undefined,
            }, ...prev];
          });
        }
        else if (payload.eventType === 'UPDATE') {
          const p = payload.new;
          setPatients(prev => prev.map(existing => {
            if (existing.id === p.id) {
              return {
                id: p.id,
                name: p.name,
                regNumber: p.reg_number,
                allocation: p.allocation,
                createdAt: new Date(p.created_at),
                dischargedAt: p.discharged_at ? new Date(p.discharged_at) : undefined,
                memo: p.memo || undefined,
                treatmentDailyStatus: p.treatment_daily_status,
                treatmentUpdatedAt: p.treatment_updated_at ? new Date(p.treatment_updated_at) : undefined,
              };
            }
            return existing;
          }));
        }
        else if (payload.eventType === 'DELETE') {
          setPatients(prev => prev.filter(existing => existing.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Time-based background rules (Discharge auto-delete & Treatment Reset)
  useEffect(() => {
    const applyRules = async () => {
      const now = new Date();

      // 1. Check Discharged
      for (const p of patients) {
        if (p.allocation === 'discharge' && p.dischargedAt) {
          const diffDays = (now.getTime() - p.dischargedAt.getTime()) / (1000 * 3600 * 24);
          if (diffDays >= 2) {
            await supabase.from('patients').delete().eq('id', p.id);
          }
        }
      }

      // 2. Check Auto Reset
      const cutoff = new Date(now);
      cutoff.setHours(8, 0, 0, 0);
      if (now.getHours() < 8) cutoff.setDate(cutoff.getDate() - 1);

      for (const p of patients) {
        if (p.treatmentDailyStatus && p.treatmentDailyStatus !== 'none') {
          if (!p.treatmentUpdatedAt || p.treatmentUpdatedAt < cutoff) {
            await supabase.from('patients').update({
              treatment_daily_status: 'none',
              treatment_updated_at: now.toISOString()
            }).eq('id', p.id);
          }
        }
      }
    };

    const interval = setInterval(applyRules, 1000 * 60); // Check every minute
    return () => clearInterval(interval);
  }, [patients]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRegNum.trim()) return;

    const newId = Date.now().toString();
    const newPatient: Patient = {
      id: newId,
      name: newName.trim(),
      regNumber: newRegNum.trim(),
      allocation: 'unassigned',
      createdAt: new Date(),
    };

    setPatients([newPatient, ...patients]);
    setNewName('');
    setNewRegNum('');
    setIsRegistrationModalOpen(false);

    await supabase.from('patients').insert([{
      id: newId,
      name: newPatient.name,
      reg_number: newPatient.regNumber,
      allocation: newPatient.allocation,
      created_at: newPatient.createdAt.toISOString()
    }]);

    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `${newPatient.name}님이 등록되었습니다.` })
    }).catch(console.error);
  };

  const handleAllocationChange = async (patientId: string, newAllocation: AllocationType) => {
    const p = patients.find(x => x.id === patientId);
    if (!p) return;

    const dischargedAt = newAllocation === 'discharge' && p.allocation !== 'discharge' ? new Date() : p.dischargedAt;

    setPatients(patients.map(x => {
      if (x.id !== patientId) return x;
      return { ...x, allocation: newAllocation, dischargedAt };
    }));

    await supabase.from('patients').update({
      allocation: newAllocation,
      discharged_at: dischargedAt ? dischargedAt.toISOString() : null
    }).eq('id', patientId);
  };

  const toggleTreatmentStatus = async (patientId: string) => {
    const p = patients.find(x => x.id === patientId);
    if (!p) return;

    let nextStatus: TreatmentStatus = 'none';
    if (!p.treatmentDailyStatus || p.treatmentDailyStatus === 'none') nextStatus = 'done';
    else if (p.treatmentDailyStatus === 'done') nextStatus = 'missed';
    else nextStatus = 'none';

    const now = new Date();

    setPatients(patients.map(x => {
      if (x.id !== patientId) return x;
      return { ...x, treatmentDailyStatus: nextStatus, treatmentUpdatedAt: now };
    }));

    await supabase.from('patients').update({
      treatment_daily_status: nextStatus,
      treatment_updated_at: now.toISOString()
    }).eq('id', patientId);
  };

  const waitingPatients = patients.filter(p => p.allocation === 'unassigned');
  const assignedPatients = {
    'mon-wed': patients.filter(p => p.allocation === 'mon-wed'),
    'tue-thu': patients.filter(p => p.allocation === 'tue-thu'),
    'early': patients.filter(p => p.allocation === 'early'),
  };
  const dischargedPatients = patients.filter(p => p.allocation === 'discharge');

  const renderAssignedList = (title: string, list: Patient[], bgClass: string, textClass: string) => (
    <div className={`rounded-xl shadow-sm border p-4 flex flex-col gap-4 ${bgClass}`}>
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className={`font-semibold ${textClass}`}>{title} 명단</h3>
        <span className="text-sm font-medium">{list.length}명</span>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-center py-4 text-gray-400">배정된 환자가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {list.map(p => (
            <li key={p.id} className="bg-white rounded p-3 shadow-sm border border-gray-100 flex flex-row items-center justify-between text-sm overflow-x-auto whitespace-nowrap gap-3">
              <div className="flex items-center flex-shrink-0">
                <button
                  onClick={() => toggleTreatmentStatus(p.id)}
                  className={`w-6 h-6 mr-3 flex-shrink-0 flex items-center justify-center rounded border transition-colors ${!p.treatmentDailyStatus || p.treatmentDailyStatus === 'none' ? 'border-gray-300 bg-white hover:bg-gray-50' :
                    p.treatmentDailyStatus === 'done' ? 'border-green-500 bg-green-50 text-green-600' :
                      'border-red-500 bg-red-50 text-red-600'
                    }`}
                >
                  {p.treatmentDailyStatus === 'done' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                  {p.treatmentDailyStatus === 'missed' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>}
                </button>
                {openDropdownId === p.id ? (
                  <select
                    autoFocus
                    value={p.allocation}
                    onBlur={() => setOpenDropdownId(null)}
                    onChange={(e) => {
                      handleAllocationChange(p.id, e.target.value as AllocationType);
                      setOpenDropdownId(null);
                    }}
                    className="font-bold text-gray-800 bg-white border border-gray-300 rounded px-1 py-0.5 outline-none mr-2 flex-shrink-0"
                  >
                    <option value="mon-wed">월/수 배정</option>
                    <option value="tue-thu">화/목 배정</option>
                    <option value="early">조기 (집중)</option>
                    <option value="unassigned">대기 목록</option>
                    <option value="discharge">Discharge</option>
                  </select>
                ) : (
                  <button onClick={() => setOpenDropdownId(p.id)} className="font-bold text-gray-800 hover:text-blue-600 transition-colors mr-2 cursor-pointer text-left focus:outline-none underline decoration-gray-300 underline-offset-4 flex-shrink-0 max-w-[120px] truncate">
                    {p.name}
                  </button>
                )}
              </div>
              <div className="flex-1 min-w-[120px]">
                <input
                  type="text"
                  placeholder="병동 / 호실 번호"
                  className="w-full text-xs px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 rounded outline-none bg-gray-50/50 transition-all text-gray-700"
                  value={p.memo || ''}
                  onChange={(e) => {
                    setPatients(patients.map(patient => patient.id === p.id ? { ...patient, memo: e.target.value } : patient));
                  }}
                  onBlur={(e) => handleMemoBlur(p.id, e.target.value)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans break-words">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-600 text-white flex items-center justify-center rounded-lg font-bold text-base md:text-lg">
            +
          </div>
          <h1 className="text-base md:text-xl font-bold tracking-tight text-gray-800 truncate max-w-[150px] sm:max-w-none">신규 환자 관리 시스템</h1>
        </div>
        <div className="flex gap-2 md:gap-3">
          <button
            onClick={() => setIsRegistrationModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 md:px-5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-sm flex items-center gap-1 md:gap-2 whitespace-nowrap"
          >
            <span>+</span> 환자 등록
          </button>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Assigned Patients View */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {renderAssignedList('월/수 배정', assignedPatients['mon-wed'], 'bg-blue-50/50 border-blue-100', 'text-blue-700')}
          {renderAssignedList('화/목 배정', assignedPatients['tue-thu'], 'bg-indigo-50/50 border-indigo-100', 'text-indigo-700')}
          {renderAssignedList('조기 (집중)', assignedPatients['early'], 'bg-amber-50/50 border-amber-100', 'text-amber-700')}
        </div>

        {/* Waitlist View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col mb-8">
          <div className="border-b border-gray-200 bg-gray-50/50 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-gray-800">대기 환자 목록</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">총 {waitingPatients.length}명</span>
          </div>

          <div className="flex-1 p-0">
            {waitingPatients.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                </svg>
                <p className="text-lg text-gray-800 font-medium mb-1">대기 중인 환자가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">등록 번호</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">환자 이름</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">배정 (Assign)</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {waitingPatients.map((patient) => {
                      const isEditing = patient.id === editingPatientId;
                      return (
                        <tr key={patient.id} className="bg-white hover:bg-gray-50 transition-colors">
                          <td className="px-3 md:px-6 py-3 md:py-4 font-mono text-gray-600">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editRegNum}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  if (val.length <= 8) setEditRegNum(val);
                                }}
                                className="w-24 md:w-full text-xs px-2 py-1.5 border border-blue-300 rounded outline-none"
                              />
                            ) : (patient.regNumber)}
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 font-medium text-gray-900">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-20 md:w-full text-xs px-2 py-1.5 border border-blue-300 rounded outline-none"
                              />
                            ) : (patient.name)}
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <select
                              value={patient.allocation}
                              onChange={(e) => handleAllocationChange(patient.id, e.target.value as AllocationType)}
                              className="bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 text-xs font-medium px-2.5 py-1.5 rounded-lg border outline-none transition-colors cursor-pointer"
                            >
                              <option value="unassigned">대기 중</option>
                              <option value="mon-wed">월/수 배정</option>
                              <option value="tue-thu">화/목 배정</option>
                              <option value="early">조기 (집중)</option>
                              <option value="discharge">Discharge</option>
                            </select>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 flex gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(patient.id)}
                                  className="text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingPatientId(null)}
                                  className="text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 border border-gray-200 rounded text-xs transition-colors shrink-0"
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditing(patient)}
                                  className="text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => deletePatient(patient.id)}
                                  className="text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                                >
                                  삭제
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Discharge View */}
        <div className="bg-red-50/30 rounded-xl shadow-sm border border-red-100 overflow-hidden flex flex-col">
          <div className="border-b border-red-100 bg-red-50/50 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-red-800">Discharge 명단</h2>
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">총 {dischargedPatients.length}명</span>
          </div>

          <div className="flex-1 p-0">
            {dischargedPatients.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">최근 (48시간 이내) Discharge 된 환자가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                  <thead className="text-xs text-red-500 uppercase bg-red-50/50 border-b border-red-100">
                    <tr>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium">등록 번호</th>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium">환자 이름</th>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium">배정 상태</th>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium min-w-[150px] md:w-1/3">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {dischargedPatients.map((patient) => (
                      <tr key={patient.id} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-3 md:px-6 py-2 md:py-3 font-mono text-gray-600">{patient.regNumber}</td>
                        <td className="px-3 md:px-6 py-2 md:py-3 font-medium text-gray-900">{patient.name}</td>
                        <td className="px-3 md:px-6 py-2 md:py-3 flex flex-col sm:flex-row sm:items-center gap-1">
                          <select
                            value={patient.allocation}
                            onChange={(e) => handleAllocationChange(patient.id, e.target.value as AllocationType)}
                            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 text-xs font-medium px-2.5 py-1.5 rounded-lg border outline-none transition-colors cursor-pointer w-full sm:w-auto"
                          >
                            <option value="unassigned">대기 목록으로 복귀</option>
                            <option value="mon-wed">월/수 배정</option>
                            <option value="tue-thu">화/목 배정</option>
                            <option value="early">조기 (집중)</option>
                            <option value="discharge">d/c</option>
                          </select>
                          <span className="sm:ml-2 text-[10px] md:text-xs text-gray-400">({patient.dischargedAt?.toLocaleDateString()})</span>
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-3">
                          <input
                            type="text"
                            placeholder="메모 입력..."
                            className="w-full text-xs px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 rounded outline-none bg-transparent transition-all"
                            value={patient.memo || ''}
                            onChange={(e) => {
                              setPatients(patients.map(p => p.id === patient.id ? { ...p, memo: e.target.value } : p));
                            }}
                            onBlur={(e) => handleMemoBlur(patient.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Registration Modal */}
      {isRegistrationModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-800">신규 환자 등록</h2>
              <button
                onClick={() => setIsRegistrationModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                type="button"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleRegister}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">환자 이름</label>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="홍길동"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">등록 번호 (숫자 8자리)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newRegNum}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val.length <= 8) {
                        setNewRegNum(val);
                      }
                    }}
                    required
                    minLength={8}
                    maxLength={8}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="예: 12345678"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRegistrationModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
