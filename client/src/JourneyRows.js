import React from 'react';
import { ArrowUpRight } from 'lucide-react';

export function JourneyRows({ journeys, loading, error, onRetry, onChoose }) {
  return React.createElement('div', { className: 'journey-list' },
    React.createElement('div', { className: 'section-label' }, 'CHOOSE A WALK'),
    loading && React.createElement('p', { className: 'loading', role: 'status' }, 'Loading walks…'),
    error && React.createElement('div', { className: 'journey-error', role: 'alert' },
      React.createElement('p', null, `Could not load the walks: ${error}`),
      React.createElement('button', { className: 'secondary', type: 'button', onClick: onRetry }, 'Try again')),
    !loading && !error && journeys.map((journey, index) => React.createElement('button', {
      className: 'journey', type: 'button', key: journey.id, onClick: () => onChoose(journey),
    },
    React.createElement('span', { className: 'number' }, `0${index + 1}`),
    React.createElement('span', null,
      React.createElement('b', null, journey.name),
      React.createElement('small', null, journey.start, ' ', React.createElement(ArrowUpRight, { size: 12 }), ' ', journey.end)),
    React.createElement(ArrowUpRight, { className: 'journey-arrow', size: 17 }))),
  );
}
