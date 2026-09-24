function VocabularyFormFields({ form, onChange }) {
  return (
    <>
      <label>
        Word <span aria-hidden="true">*</span>
        <input name="word" onChange={onChange} required value={form.word} />
      </label>

      <label>
        Meaning
        <input name="meaning" onChange={onChange} value={form.meaning} />
      </label>

      <label>
        Part of Speech
        <input name="part_of_speech" onChange={onChange} value={form.part_of_speech} />
      </label>

      <label>
        Example
        <textarea name="example" onChange={onChange} rows="3" value={form.example} />
      </label>

      <label>
        Image URL
        <input name="image_url" onChange={onChange} type="url" value={form.image_url} />
      </label>

      <label>
        Status
        <select name="status" onChange={onChange} value={form.status}>
          <option value="new">New</option>
          <option value="learning">Learning</option>
          <option value="learned">Learned</option>
        </select>
      </label>
    </>
  )
}

export default VocabularyFormFields
