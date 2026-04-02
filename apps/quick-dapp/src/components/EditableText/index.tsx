import React, { useEffect, useState } from 'react';

const EditableText = ({
  value,
  onSave,
  textarea,
  placeholder,
}: {
  value: string;
  onSave: (str: string) => void;
  textarea?: boolean;
  placeholder?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempText, setTempText] = useState(value);

  useEffect(() => {
    setTempText(value);
  }, [value]);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = () => {
    onSave(tempText);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleChange = (event: {
    target: { value: React.SetStateAction<string> };
  }) => {
    setTempText(event.target.value);
  };

  const InputElement = textarea ? 'textarea' : 'input';
  const TextElement = textarea ? 'span' : 'h1';

  return isEditing ? (
    <>
      <InputElement
        className="form-control"
        placeholder={placeholder}
        value={tempText}
        onChange={handleChange}
        style={{ height: textarea ? 100 : 'auto' }}
      />
      <div className="flex justify-end">
        <i
          className="fas ml-2 mt-2 fa-save cursor_pointer"
          onClick={handleSave}
        />
        <i
          className="fas ml-2 mt-2 fa-ban cursor_pointer"
          onClick={handleCancel}
        />
      </div>
    </>
  ) : (
    <div className="flex justify-between items-center">
      <TextElement className="udapp_intro">
        {value ? value : placeholder}
      </TextElement>
      <i
        className="fas fa-edit ml-2 float-end cursor_pointer"
        onClick={handleEdit}
      />
    </div>
  );
};

export default EditableText;
