import React from 'react';
import { Alert } from 'react-bootstrap'; 
import { FormattedMessage } from 'react-intl';

interface CreateInstanceProps {
  isAiLoading: boolean;
}

const CreateInstance: React.FC<CreateInstanceProps> = ({ isAiLoading }) => {
  
  return (
    <div className="text-center">
      {isAiLoading ? (
        <div className="mt-4 mb-3 p-4">
          <i className="fas fa-spinner fa-spin me-2"></i>
          Your dapp is being created by RemixAI Assistant.
        </div>
      ) : (
        <>
          <Alert 
            className="mt-4 d-flex align-items-center justify-content-center" 
            variant="info" 
            data-id="quickDappTooltips"
          >
            <div className="flex-shrink-0 me-3">
              <img 
                src='./assets/sparkling.png' 
                style={{ width: '300px' }}
                alt="Sparkling star icon" 
              />
            </div>
            <div className="text-start"> 
              <FormattedMessage id="quickDapp.text1" />
              <br />
              <FormattedMessage id="quickDapp.text2" />
            </div>
          </Alert>
          <div className="mt-4 mb-3">
            <FormattedMessage id="quickDapp.text7" />
          </div>
        </>
      )}
    </div>
  );
};

export default CreateInstance;