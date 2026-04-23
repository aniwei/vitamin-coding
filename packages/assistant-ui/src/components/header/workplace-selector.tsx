
type WorkplaceSelectorProps = {
  children?: React.ReactNode
}

export const WorkplaceSelector: React.FC<WorkplaceSelectorProps> = ({
  children
}) => {
  
  return (
    <div>{children}</div>
  )
}

WorkplaceSelector.displayName = 'WorkplaceSelector'
export default WorkplaceSelector
