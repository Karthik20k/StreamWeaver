import React, { useState } from 'react';
import { XIcon, CopyIcon, CheckIcon } from '../common/Icons';
import { Button } from '../common/Button';

export function MappingJsonViewerModal({
  isOpen,
  onClose,
  mappings = {},
  transformations = {},
  activeSchema,
  stats
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const payload = {
    schemaId: activeSchema?.id || 'default_schema',
    targetCollection: activeSchema?.targetCollection || 'target_collection',
    mappingRules: mappings,
    transformRules: transformations,
    validation: {
      allRequiredMapped: stats?.isAllRequiredMapped || false,
      mappedPairsCount: Object.keys(mappings).length,
      rulesConfiguredCount: Object.keys(transformations).length,
      missingRequiredFields: stats?.missingRequiredFields?.map((f) => f.name) || []
    },
    timestamp: new Date().toISOString()
  };

  const jsonString = JSON.stringify(payload, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  return (
    <div className="json-modal-backdrop" onClick={onClose}>
      <div className="json-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="json-modal-header">
          <h3>
            <CopyIcon size={18} className="text-cyan" />
            Active Mapping Configuration JSON
          </h3>
          <button
            className="search-clear-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="json-modal-body">
          <pre className="json-modal-code">{jsonString}</pre>
        </div>

        <div className="json-modal-footer">
          <Button
            variant={copied ? 'secondary' : 'outline'}
            size="sm"
            icon={copied ? CheckIcon : CopyIcon}
            onClick={handleCopy}
          >
            {copied ? 'Copied to Clipboard' : 'Copy JSON'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
