const updateComment = (body, ast) => {
  let commentArr = []
  const newBody = []

  for (let i = 0; i < body.length; i++) {
    const obj = body[i]
    if (obj.type === 'Line' || obj.type === 'Block') {
      commentArr.push(obj)
      if (i === body.length - 1) {
        if (newBody.length === 0) {
          ast.leadingComments = commentArr
        } else {
          newBody[newBody.length - 1].trailingComments = commentArr
        }
      }
    } else {
      if (commentArr.length > 0) {
        obj.leadingComments = commentArr
        commentArr = []
      }
      newBody.push(obj)
    }
  }
  return newBody
}

module.exports = updateComment
