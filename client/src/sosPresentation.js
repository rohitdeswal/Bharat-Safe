export function getSosPresentation(status, error = '', deliveries = [], serverStatus = 'active') {
  const created = status === 'created';
  const failed = status === 'failed';
  const explicitNoSos = /no (?:active )?sos exists/i.test(error);
  const activeConflict = !explicitNoSos && /active sos|sos is being created|already active/i.test(error);
  return {
    title: created ? serverStatus==='expired'?'SOS alert expired':serverStatus==='cleared'?'All-clear received':'SOS alert is active' : failed ? 'SOS could not be sent' : 'Sending SOS…',
    created,
    reason: error,
    showDeliveryList: created && deliveries.length > 0,
    showRetry: failed,
    showClearPrevious: failed && activeConflict,
    noSosExists: failed && explicitNoSos,
  };
}
