'use client';

import { useState, useEffect } from 'react';

type AllocationType = 'unassigned' | 'mon-wed' | 'tue-thu' | 'early' | 'discharge';

interface Patient {
  id: string;
  name: string;
  regNumber: string;
  allocation: AllocationType;
  createdAt: Date;
  dischargedAt?: Date;
  memo?: string;
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

  const startEditing = (patient: Patient) => {
    setEditingPatientId(patient.id);
    setEditName(patient.name);
    setEditRegNum(patient.regNumber);
  };

  const saveEdit = (patientId: string) => {
    setPatients(patients.map(p => {
      if (p.id !== patientId) return p;
      return {
        ...p,
        name: editName.trim() || p.name,
        regNumber: editRegNum.trim() || p.regNumber,
      };
    }));
    setEditingPatientId(null);
  };

  // Auto-remove discharged patients after 2 days
  useEffect(() => {
    const checkDischarged = () => {
      const now = new Date();
      setPatients(prev => prev.filter(p => {
        if (p.allocation !== 'discharge' || !p.dischargedAt) return true;

        const diffDays = (now.getTime() - p.dischargedAt.getTime()) / (1000 * 3600 * 24);
        return diffDays < 2; // Keep if discharged within 2 days
      }));
    };

    checkDischarged(); // Check on mount
    const interval = setInterval(checkDischarged, 1000 * 60 * 60); // Check every hour
    return () => clearInterval(interval);
  }, []);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRegNum.trim()) return;

    const newPatient: Patient = {
      id: Date.now().toString(),
      name: newName.trim(),
      regNumber: newRegNum.trim(),
      allocation: 'unassigned', // Default to unassigned when newly registered
      createdAt: new Date(),
    };

    setPatients([newPatient, ...patients]);
    setNewName('');
    setNewRegNum('');
    setIsRegistrationModalOpen(false);
  };

  const handleAllocationChange = (patientId: string, newAllocation: AllocationType) => {
    setPatients(patients.map(p => {
      if (p.id !== patientId) return p;
      return {
        ...p,
        allocation: newAllocation,
        dischargedAt: newAllocation === 'discharge' && p.allocation !== 'discharge' ? new Date() : p.dischargedAt,
      };
    }));
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
            <li key={p.id} className="bg-white rounded p-3 shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-0 text-sm">
              <div className="flex justify-between w-full md:w-auto">
                <span className="font-bold text-gray-800 mr-2">{p.name}</span>
                <span className="text-gray-500 font-mono text-xs">{p.regNumber}</span>
              </div>
              <div className="flex flex-col sm:flex-row w-full md:w-auto items-stretch sm:items-center gap-2 md:gap-0 md:flex-1 md:mx-2 md:border-l md:border-gray-100 md:pl-2">
                <input
                  type="text"
                  placeholder="병동 / 호실 번호"
                  className="w-full text-xs px-2 py-1.5 border border-transparent hover:border-gray-200 focus:border-blue-500 rounded outline-none bg-gray-50/50 transition-all text-gray-700"
                  value={p.memo || ''}
                  onChange={(e) => {
                    setPatients(patients.map(patient => patient.id === p.id ? { ...patient, memo: e.target.value } : patient));
                  }}
                />
                <select
                  value={p.allocation}
                  onChange={(e) => handleAllocationChange(p.id, e.target.value as AllocationType)}
                  className="bg-gray-50 md:bg-transparent text-gray-600 md:text-gray-500 hover:bg-gray-100 md:hover:bg-gray-50 text-xs font-medium px-2 py-1.5 md:py-1 rounded border border-gray-200 outline-none transition-colors cursor-pointer sm:ml-2"
                >
                  <option value="mon-wed">월/수 배정</option>
                  <option value="tue-thu">화/목 배정</option>
                  <option value="early">조기 (집중)</option>
                  <option value="unassigned">대기 목록</option>
                  <option value="discharge">Discharge</option>
                </select>
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
                              <button
                                onClick={() => saveEdit(patient.id)}
                                className="text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                              >
                                저장
                              </button>
                            ) : (
                              <button
                                onClick={() => startEditing(patient)}
                                className="text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                              >
                                수정
                              </button>
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
                    type="text"
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
