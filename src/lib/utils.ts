export const isAbortedError = (err: any) => {
  if (!err) return false;
  
  const errMsg = (typeof err === 'string' ? err : (err?.message || err?.toString() || '')).toLowerCase();
  const errName = (err?.name || '').toLowerCase();
  
  return errName === 'aborterror' || 
         errMsg.includes('aborted') || 
         errMsg.includes('abort') ||
         errMsg.includes('the user aborted a request');
};
