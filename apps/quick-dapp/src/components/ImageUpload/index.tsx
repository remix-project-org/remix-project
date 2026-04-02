import React, { useContext, useEffect, useState } from 'react'
import { useIntl } from 'react-intl';
import { CustomTooltip } from '@remix-ui/helper';
import { AppContext } from '../../contexts'

const ImageUpload = () => {
  const intl = useIntl()
  const { appState, dispatch } = useContext(AppContext)
  const { logo } = appState.instance
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (logo) {
      const base64data = btoa(new Uint8Array(logo).reduce((data, byte) => data + String.fromCharCode(byte), ''))
      setPreview('data:image/jpeg;base64,' + base64data)
    } else {
      setPreview(null)
    }
  }, [logo])

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader: any = new FileReader()
      reader.onloadend = () => {
        dispatch({ type: 'SET_INSTANCE', payload: { logo: reader.result } })
      }
      reader.readAsArrayBuffer(e.target.files[0])
    }
  }

  return (
    <div className="col-3 pr-0 my-2 flex justify-center items-center">
      <input data-id="uploadLogo" className="hidden" type="file" accept="image/*" onChange={handleImageChange} id="upload-button" />
      {logo ? (
        <div className='absolute'>
          <img src={preview} alt="preview" style={{ width: 95, height: 95 }} />
          <CustomTooltip
            placement="right"
            tooltipText={intl.formatMessage({ id: 'quickDapp.deleteLogoTooltip' })}
          >
            <span
              className="btn absolute"
              style={{
                top: -30,
                right: -30,
              }}
              onClick={(event) => {
                event.preventDefault()
                // @ts-expect-error
                document.getElementById('upload-button').value = ''
                dispatch({ type: 'SET_INSTANCE', payload: { logo: '' } })
              }}
            >
              <i className="fas fa-times text-dark"></i>
            </span>
          </CustomTooltip>
        </div>
      ) : (
        <div className="bg-light" style={{ height: 158.5, width: 158.5 }}>
          <div style={{ padding: 15 }}>
            <div className='mt-2' style={{ fontSize: 15, lineHeight: '18px' }}>A logo is optional and should be<br/> 95px ✖️ 95px.</div>
            <label htmlFor="upload-button" className='text-center block'>
              <CustomTooltip
                placement="right"
                tooltipText={intl.formatMessage({ id: 'quickDapp.addLogoTooltip' })}
              >
                <div className='mt-4 inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors btn-sm' style={{ height: 32, width: 100, lineHeight: '22px' }}>Select Logo</div>
              </CustomTooltip>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageUpload
